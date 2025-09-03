import os
import json
import datetime as dt
from typing import Any, Dict, List, Optional

import requests
from dateutil import parser as du

from .db import db


BASE = "https://api.ticktick.com/open/v1"
OAUTH_TOKEN = "https://ticktick.com/oauth/token"
AUTH_URL = "https://ticktick.com/oauth/authorize"
DEFAULT_SCOPE = "tasks:read tasks:write"


def _env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env: {name}")
    return v


def get_refresh_token() -> Optional[str]:
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("select refresh_token from oauth_tokens where provider='ticktick'")
            row = cur.fetchone()
            return row["refresh_token"] if row else None

def get_stored_access_token() -> tuple[Optional[str], Optional[dt.datetime]]:
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("select access_token, access_expires_at from oauth_tokens where provider='ticktick'")
            row = cur.fetchone()
            if not row:
                return None, None
            return row["access_token"], row["access_expires_at"]


def save_tokens(refresh_token: Optional[str], access_token: Optional[str], expires_in_secs: Optional[int] = None) -> None:
    exp_ts = None
    if expires_in_secs is not None:
        try:
            exp_ts = dt.datetime.now(tz=dt.timezone.utc) + dt.timedelta(seconds=int(expires_in_secs))
        except Exception:
            exp_ts = None
    sql = """
    insert into oauth_tokens (provider, refresh_token, access_token, access_expires_at, updated_at)
    values ('ticktick', %(rt)s, %(at)s, %(exp)s, now())
    on conflict (provider) do update set
      refresh_token=excluded.refresh_token,
      access_token=excluded.access_token,
      access_expires_at=excluded.access_expires_at,
      updated_at=now();
    """
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"rt": refresh_token, "at": access_token, "exp": exp_ts})


def reset_refresh_token(new_refresh_token: Optional[str] = None) -> None:
    with db() as conn:
        with conn.cursor() as cur:
            if new_refresh_token:
                cur.execute(
                    """
                    insert into oauth_tokens (provider, refresh_token, access_token, access_expires_at, updated_at)
                    values ('ticktick', %(rt)s, null, null, now())
                    on conflict (provider) do update set refresh_token=excluded.refresh_token, access_token=null, access_expires_at=null, updated_at=now()
                    """,
                    {"rt": new_refresh_token},
                )
            else:
                cur.execute("delete from oauth_tokens where provider='ticktick'")


def refresh_access_token() -> str:
    rt = get_refresh_token() or os.getenv("TICKTICK_REFRESH_TOKEN")
    if not rt:
        raise RuntimeError("Missing TickTick refresh token. Use the UI to authorize and save it.")
    # Use HTTP Basic auth as required by TickTick
    auth = requests.auth.HTTPBasicAuth(_env("TICKTICK_CLIENT_ID"), _env("TICKTICK_CLIENT_SECRET"))
    data = {
        "grant_type": "refresh_token",
        "refresh_token": rt,
        "scope": DEFAULT_SCOPE,
    }
    r = requests.post(OAUTH_TOKEN, data=data, auth=auth, headers={"Accept": "application/json"}, timeout=30)
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise RuntimeError(f"TickTick token refresh failed ({r.status_code}): {detail}")
    payload = r.json()
    save_tokens(payload.get("refresh_token") or rt, payload.get("access_token"), payload.get("expires_in"))
    return payload["access_token"]


def headers() -> dict:
    # Use cached access token if valid
    at, exp = get_stored_access_token()
    now = dt.datetime.now(tz=dt.timezone.utc)
    if at and (exp is None or exp > now):
        return {"Authorization": f"Bearer {at}"}
    # Otherwise try refresh
    try:
        new_at = refresh_access_token()
        return {"Authorization": f"Bearer {new_at}"}
    except Exception:
        pass
    # Fallback to env access token if provided
    env_at = os.getenv("TICKTICK_ACCESS_TOKEN")
    if env_at:
        return {"Authorization": f"Bearer {env_at}"}
    raise RuntimeError("No valid TickTick token available. Re-authorize in the UI.")


def list_projects() -> List[Dict[str, Any]]:
    r = requests.get(f"{BASE}/project", headers=headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def get_project_tasks(project_id: str) -> List[Dict[str, Any]]:
    r = requests.get(f"{BASE}/project/{project_id}/data", headers=headers(), timeout=60)
    r.raise_for_status()
    payload = r.json()
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if "tasks" in payload and isinstance(payload["tasks"], list):
            return payload["tasks"]
        if (
            "syncTaskBean" in payload
            and isinstance(payload["syncTaskBean"], dict)
            and "tasks" in payload["syncTaskBean"]
        ):
            return payload["syncTaskBean"]["tasks"]
    return []


def _parse_ts(s: str | None):
    if not s:
        return None
    try:
        return du.isoparse(s)
    except Exception:
        return None


def build_authorize_url(redirect_uri: str, state: str = "setup1", scope: Optional[str] = None) -> str:
    import urllib.parse as up
    params = {
        "client_id": _env("TICKTICK_CLIENT_ID"),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    }
    params["scope"] = scope or DEFAULT_SCOPE
    return f"{AUTH_URL}?{up.urlencode(params)}"


def exchange_code_for_tokens(code: str, redirect_uri: str, scope: Optional[str] = None) -> Dict[str, Any]:
    auth = requests.auth.HTTPBasicAuth(_env("TICKTICK_CLIENT_ID"), _env("TICKTICK_CLIENT_SECRET"))
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "scope": scope or DEFAULT_SCOPE,
    }
    r = requests.post(OAUTH_TOKEN, data=data, auth=auth, headers={"Accept": "application/json"}, timeout=30)
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise RuntimeError(f"TickTick code exchange failed ({r.status_code}): {detail}")
    payload = r.json()
    # Persist tokens (some apps may not return a refresh_token)
    save_tokens(payload.get("refresh_token"), payload.get("access_token"), payload.get("expires_in"))
    return payload


def upsert_tasks(tasks: List[Dict[str, Any]]) -> int:
    if not tasks:
        return 0
    sql = """
    insert into ticktick_tasks (
      id, project_id, title, content, "desc", is_all_day, start_date, due_date,
      time_zone, repeat_flag, reminders, priority, status, completed_time,
      sort_order, items, tags, modified_time, created_time, deleted, etag, raw, last_synced_at
    ) values (
      %(id)s, %(projectId)s, %(title)s, %(content)s, %(desc)s, %(isAllDay)s,
      %(startDate_ts)s, %(dueDate_ts)s, %(timeZone)s, %(repeatFlag)s, %(reminders_json)s,
      %(priority)s, %(status)s, %(completedTime_ts)s, %(sortOrder)s, %(items_json)s,
      %(tags_arr)s, %(modifiedTime_ts)s, %(createdTime_ts)s, %(deleted)s, %(etag)s,
      %(raw_json)s, now()
    ) on conflict (id) do update set
      project_id=excluded.project_id,
      title=excluded.title,
      content=excluded.content,
      "desc"=excluded."desc",
      is_all_day=excluded.is_all_day,
      start_date=excluded.start_date,
      due_date=excluded.due_date,
      time_zone=excluded.time_zone,
      repeat_flag=excluded.repeat_flag,
      reminders=excluded.reminders,
      priority=excluded.priority,
      status=excluded.status,
      completed_time=excluded.completed_time,
      sort_order=excluded.sort_order,
      items=excluded.items,
      tags=excluded.tags,
      modified_time=excluded.modified_time,
      created_time=excluded.created_time,
      deleted=excluded.deleted,
      etag=excluded.etag,
      raw=excluded.raw,
      last_synced_at=now();
    """
    with db() as conn:
        with conn.cursor() as cur:
            for t in tasks:
                row = {
                    "id": t.get("id"),
                    "projectId": t.get("projectId"),
                    "title": t.get("title"),
                    "content": t.get("content"),
                    "desc": t.get("desc"),
                    "isAllDay": t.get("isAllDay") or t.get("allDay"),
                    "startDate_ts": _parse_ts(t.get("startDate")),
                    "dueDate_ts": _parse_ts(t.get("dueDate")),
                    "timeZone": t.get("timeZone"),
                    "repeatFlag": t.get("repeatFlag") or t.get("repeat"),
                    "reminders_json": json.dumps(t.get("reminders") or []),
                    "priority": t.get("priority"),
                    "status": t.get("status"),
                    "completedTime_ts": _parse_ts(t.get("completedTime")),
                    "sortOrder": t.get("sortOrder"),
                    "items_json": json.dumps(t.get("items") or []),
                    "tags_arr": t.get("tags"),
                    "modifiedTime_ts": _parse_ts(t.get("modifiedTime")),
                    "createdTime_ts": _parse_ts(t.get("createdTime")),
                    "deleted": t.get("deleted"),
                    "etag": t.get("etag"),
                    "raw_json": json.dumps(t),
                }
                cur.execute(sql, row)
    return len(tasks)
