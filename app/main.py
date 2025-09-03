import os
import asyncio
from typing import Optional

from fastapi import FastAPI, HTTPException
import gradio as gr

from dotenv import load_dotenv
from .db import init_schema, db
from .models import MetricsIn, MetricsOut
from .strava import (
    fetch_all_activities,
    upsert_activities,
    build_authorize_url as strava_build_authorize_url,
    exchange_code_for_tokens as strava_exchange_code,
)
from .ticktick import (
    list_projects as tt_list_projects,
    get_project_tasks as tt_get_tasks,
    upsert_tasks as tt_upsert,
    build_authorize_url as tt_build_authorize_url,
    exchange_code_for_tokens as tt_exchange_code,
)
from .ui import build_ui


app = FastAPI(title="Aegis Sync API", version="0.1.0")


@app.on_event("startup")
def on_startup():
    # Load env from .env if present
    load_dotenv()
    init_schema()
    # Optional recurring sync if configured
    interval = os.getenv("STRAVA_SYNC_INTERVAL_MINUTES")
    if interval:
        minutes = max(1, int(interval))
        asyncio.create_task(_periodic_strava_sync(minutes))


async def _periodic_strava_sync(minutes: int):
    while True:
        try:
            rows = fetch_all_activities()
            n = upsert_activities(rows)
            # Log to console
            print(f"Strava periodic sync upserted: {n}")
        except Exception as e:
            print(f"Strava periodic sync failed: {e}")
        await asyncio.sleep(minutes * 60)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/oauth/ticktick/callback")
def ticktick_oauth_callback(code: Optional[str] = None, state: Optional[str] = None):
    """Helper endpoint to capture the authorization code during setup."""
    if not code:
        return {"message": "No code provided. Did you hit this from TickTick authorize?", "state": state}
    return {"code": code, "state": state}

@app.get("/oauth/strava/callback")
def strava_oauth_callback(code: Optional[str] = None, scope: Optional[str] = None, state: Optional[str] = None):
    return {"code": code, "scope": scope, "state": state}

@app.get("/oauth/strava/authorize_url")
def strava_authorize_url(redirect_uri: Optional[str] = None, scopes: Optional[str] = "read,activity:read_all", state: str = "setup1", approval_prompt: str = "force"):
    ru = redirect_uri or "http://localhost:8000/oauth/strava/callback"
    scopes_list = [s.strip() for s in (scopes or "").split(",") if s.strip()]
    return {"authorize_url": strava_build_authorize_url(scopes_list, ru, state, approval_prompt)}

@app.post("/oauth/strava/exchange")
def strava_exchange(code: str, redirect_uri: Optional[str] = None):
    ru = redirect_uri or "http://localhost:8000/oauth/strava/callback"
    try:
        tokens = strava_exchange_code(code, ru)
        # Do not store automatically; just return to user to place in .env
        return tokens
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Mount Gradio UI at /ui
demo = build_ui()
gr.mount_gradio_app(app, demo, path="/ui")


@app.post("/sync/strava")
def sync_strava(per_page: int = 200, page_start: int = 1, after: Optional[int] = None):
    try:
        data = fetch_all_activities(per_page=per_page, page_start=page_start, after=after)
        n = upsert_activities(data)
        return {"activities_upserted": n}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/strava/activities")
def list_strava(limit: int = 50, offset: int = 0):
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select * from strava_activities order by start_date desc nulls last limit %s offset %s",
                (limit, offset),
            )
            return cur.fetchall()


@app.get("/ticktick/projects")
def ticktick_projects():
    try:
        return tt_list_projects()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sync/ticktick/{project_id}")
def sync_ticktick(project_id: str):
    try:
        tasks = tt_get_tasks(project_id)
        n = tt_upsert(tasks)
        return {"projectId": project_id, "tasks_upserted": n}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/oauth/ticktick/callback")
def ticktick_oauth_callback_api(code: Optional[str] = None, state: Optional[str] = None):
    return {"code": code, "state": state}


@app.get("/oauth/ticktick/authorize_url")
def ticktick_authorize_url(redirect_uri: Optional[str] = None, state: str = "setup1", scope: Optional[str] = None):
    ru = redirect_uri or "http://localhost:8000/oauth/ticktick/callback"
    try:
        url = tt_build_authorize_url(ru, state, scope)
        return {"authorize_url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/oauth/ticktick/exchange")
def ticktick_exchange(code: str, redirect_uri: Optional[str] = None):
    ru = redirect_uri or "http://localhost:8000/oauth/ticktick/callback"
    try:
        tokens = tt_exchange_code(code, ru)
        return tokens
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/metrics", response_model=MetricsOut)
def upsert_metrics(m: MetricsIn):
    sql = """
    insert into daily_metrics (day, calorie_in, calorie_out, protein_g, weight_kg, notes)
    values (%(day)s, %(calorie_in)s, %(calorie_out)s, %(protein_g)s, %(weight_kg)s, %(notes)s)
    on conflict (day) do update set
      calorie_in = excluded.calorie_in,
      calorie_out = excluded.calorie_out,
      protein_g = excluded.protein_g,
      weight_kg = excluded.weight_kg,
      notes = excluded.notes,
      updated_at = now()
    returning day::text, calorie_in, calorie_out, protein_g, weight_kg::float, notes
    """
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, m.model_dump())
            row = cur.fetchone()
            return {
                "day": row["day"],
                "calorie_in": row["calorie_in"],
                "calorie_out": row["calorie_out"],
                "protein_g": row["protein_g"],
                "weight_kg": float(row["weight_kg"]),
                "notes": row["notes"],
            }


@app.get("/metrics")
def list_metrics(start: Optional[str] = None, end: Optional[str] = None, limit: int = 100):
    where = []
    params = []
    if start:
        where.append("day >= %s")
        params.append(start)
    if end:
        where.append("day <= %s")
        params.append(end)
    sql = "select day::text, calorie_in, calorie_out, protein_g, weight_kg::float, notes from daily_metrics"
    if where:
        sql += " where " + " and ".join(where)
    sql += " order by day desc limit %s"
    params.append(limit)
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()
