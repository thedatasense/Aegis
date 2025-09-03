import os
import json
import time
from typing import Any, Dict, List, Optional

import requests
import datetime as dt
from dateutil import parser as du

from .db import db


STRAVA_OAUTH_TOKEN = "https://www.strava.com/oauth/token"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_ACTIVITIES = "https://www.strava.com/api/v3/athlete/activities"


def _env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env: {name}")
    return v


def strava_access_token() -> str:
    # Prefer stored refresh token; fall back to env
    rt = get_refresh_token() or os.getenv("STRAVA_REFRESH_TOKEN")
    if not rt:
        raise RuntimeError("Missing Strava refresh token. Use UI to authorize and save it.")
    data = {
        "client_id": _env("STRAVA_CLIENT_ID"),
        "client_secret": _env("STRAVA_CLIENT_SECRET"),
        "refresh_token": rt,
        "grant_type": "refresh_token",
    }
    r = requests.post(STRAVA_OAUTH_TOKEN, data=data, timeout=30)
    if r.status_code >= 400:
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise RuntimeError(f"Strava token refresh failed ({r.status_code}): {detail}")
    payload = r.json()
    # Persist rotated refresh token if provided
    if payload.get("refresh_token") and payload.get("refresh_token") != rt:
        save_refresh_token(payload.get("refresh_token"), payload.get("access_token"), payload.get("expires_at"))
    else:
        # Still persist access info for visibility
        save_refresh_token(rt, payload.get("access_token"), payload.get("expires_at"))
    return payload["access_token"]


def fetch_all_activities(per_page: int = 200, page_start: int = 1, after: Optional[int] = None) -> List[Dict[str, Any]]:
    token = strava_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    page = page_start
    results: List[Dict[str, Any]] = []
    # API max is 200
    per_page = max(1, min(int(per_page or 200), 200))

    while True:
        params = {"per_page": per_page, "page": page}
        if after is not None:
            params["after"] = after  # epoch seconds
        r = requests.get(STRAVA_ACTIVITIES, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        results.extend(batch)
        page += 1
        # Be polite to API
        time.sleep(0.1)
    return results


def build_authorize_url(scopes: List[str], redirect_uri: str, state: str = "setup1", approval_prompt: str = "force") -> str:
    import urllib.parse as up
    params = {
        "client_id": _env("STRAVA_CLIENT_ID"),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "approval_prompt": approval_prompt,
        "scope": ",".join(scopes),
        "state": state,
    }
    return f"{STRAVA_AUTH_URL}?{up.urlencode(params)}"


def exchange_code_for_tokens(code: str, redirect_uri: str) -> Dict[str, Any]:
    data = {
        "client_id": _env("STRAVA_CLIENT_ID"),
        "client_secret": _env("STRAVA_CLIENT_SECRET"),
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    r = requests.post(STRAVA_OAUTH_TOKEN, data=data, timeout=30)
    r.raise_for_status()
    payload = r.json()
    # Do not assume presence; but save if provided
    if payload.get("refresh_token"):
        save_refresh_token(payload.get("refresh_token"), payload.get("access_token"), payload.get("expires_at"))
    return payload


def get_refresh_token() -> Optional[str]:
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("select refresh_token from oauth_tokens where provider='strava'")
            row = cur.fetchone()
            return row["refresh_token"] if row else None


def save_refresh_token(refresh_token: str, access_token: Optional[str] = None, expires_at_epoch: Optional[int] = None) -> None:
    # expires_at is epoch seconds per Strava
    expires_ts = None
    if expires_at_epoch:
        try:
            expires_ts = dt.datetime.fromtimestamp(int(expires_at_epoch), tz=dt.timezone.utc)
        except Exception:
            expires_ts = None
    sql = """
    insert into oauth_tokens (provider, refresh_token, access_token, access_expires_at, updated_at)
    values ('strava', %(rt)s, %(at)s, %(exp)s, now())
    on conflict (provider) do update set
      refresh_token=excluded.refresh_token,
      access_token=excluded.access_token,
      access_expires_at=excluded.access_expires_at,
      updated_at=now();
    """
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, {"rt": refresh_token, "at": access_token, "exp": expires_ts})


def reset_refresh_token(new_refresh_token: Optional[str] = None) -> None:
    """Delete stored Strava token, or replace with provided one."""
    with db() as conn:
        with conn.cursor() as cur:
            if new_refresh_token:
                cur.execute(
                    """
                    insert into oauth_tokens (provider, refresh_token, updated_at)
                    values ('strava', %(rt)s, now())
                    on conflict (provider) do update set refresh_token=excluded.refresh_token, updated_at=now()
                    """,
                    {"rt": new_refresh_token},
                )
            else:
                cur.execute("delete from oauth_tokens where provider='strava'")


def _parse_dt(s: Optional[str]):
    if not s:
        return None
    try:
        return du.isoparse(s)
    except Exception:
        return None


def upsert_activities(rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    sql = """
    insert into strava_activities (
      id, type, name, distance, moving_time, elapsed_time, total_elevation_gain,
      start_date, start_latlng, kilojoules, average_heartrate, max_heartrate,
      elev_high, elev_low, average_speed, max_speed, raw, last_synced_at
    ) values (
      %(id)s, %(type)s, %(name)s, %(distance)s, %(moving_time)s, %(elapsed_time)s, %(total_elevation_gain)s,
      %(start_date_ts)s, %(start_latlng_json)s, %(kilojoules)s, %(average_heartrate)s, %(max_heartrate)s,
      %(elev_high)s, %(elev_low)s, %(average_speed)s, %(max_speed)s, %(raw_json)s, now()
    ) on conflict (id) do update set
      type = excluded.type,
      name = excluded.name,
      distance = excluded.distance,
      moving_time = excluded.moving_time,
      elapsed_time = excluded.elapsed_time,
      total_elevation_gain = excluded.total_elevation_gain,
      start_date = excluded.start_date,
      start_latlng = excluded.start_latlng,
      kilojoules = excluded.kilojoules,
      average_heartrate = excluded.average_heartrate,
      max_heartrate = excluded.max_heartrate,
      elev_high = excluded.elev_high,
      elev_low = excluded.elev_low,
      average_speed = excluded.average_speed,
      max_speed = excluded.max_speed,
      raw = excluded.raw,
      last_synced_at = now();
    """
    with db() as conn:
        with conn.cursor() as cur:
            for r in rows:
                rec = {
                    "id": r.get("id"),
                    "type": r.get("type"),
                    "name": r.get("name"),
                    "distance": r.get("distance"),
                    "moving_time": r.get("moving_time"),
                    "elapsed_time": r.get("elapsed_time"),
                    "total_elevation_gain": r.get("total_elevation_gain"),
                    "start_date_ts": _parse_dt(r.get("start_date")),
                    "start_latlng_json": json.dumps(r.get("start_latlng")),
                    "kilojoules": r.get("kilojoules"),
                    "average_heartrate": r.get("average_heartrate"),
                    "max_heartrate": r.get("max_heartrate"),
                    "elev_high": r.get("elev_high"),
                    "elev_low": r.get("elev_low"),
                    "average_speed": r.get("average_speed"),
                    "max_speed": r.get("max_speed"),
                    "raw_json": json.dumps(r),
                }
                cur.execute(sql, rec)
    return len(rows)
