from typing import Optional, List, Any
import os

import gradio as gr

from .db import db
from .strava import (
    fetch_all_activities,
    upsert_activities,
    build_authorize_url,
    exchange_code_for_tokens,
    save_refresh_token,
    get_refresh_token,
    reset_refresh_token,
)
from .ticktick import (
    list_projects as tt_list_projects,
    get_project_tasks as tt_get_tasks,
    upsert_tasks as tt_upsert,
    build_authorize_url as tt_build_authorize_url,
    exchange_code_for_tokens as tt_exchange_code,
    reset_refresh_token as tt_reset_refresh,
    get_refresh_token as tt_get_tt_refresh,
    refresh_access_token as tt_refresh_access,
)


def _list_strava(limit: int, offset: int) -> list[list[Any]]:
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, type, name, start_date, distance from strava_activities order by start_date desc nulls last limit %s offset %s",
                (limit, offset),
            )
            rows = cur.fetchall()
            data = []
            for r in rows:
                data.append([
                    r["id"], r["type"], r["name"], r["start_date"], r["distance"],
                ])
            return data


def _upsert_metrics(day: str, calorie_in: int, calorie_out: int, protein_g: int, weight_kg: float, notes: str | None):
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
            cur.execute(
                sql,
                {
                    "day": day,
                    "calorie_in": calorie_in,
                    "calorie_out": calorie_out,
                    "protein_g": protein_g,
                    "weight_kg": weight_kg,
                    "notes": notes,
                },
            )
            row = cur.fetchone()
            return row


def _list_metrics(start: Optional[str], end: Optional[str], limit: int) -> list[list[Any]]:
    where = []
    params: list[Any] = []
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
            rows = cur.fetchall()
            data = []
            for r in rows:
                data.append([r["day"], r["calorie_in"], r["calorie_out"], r["protein_g"], float(r["weight_kg"]), r["notes"]])
            return data


def build_ui() -> gr.Blocks:
    with gr.Blocks(title="Aegis Sync UI") as demo:
        gr.Markdown("# Aegis Sync — Strava, TickTick, Metrics")

        with gr.Tab("Strava"):
            gr.Markdown("## Sync Strava Activities")
            with gr.Row():
                per_page = gr.Number(value=200, label="per_page", precision=0)
                page_start = gr.Number(value=1, label="page_start", precision=0)
                after = gr.Number(value=None, label="after (epoch seconds)", precision=0)
            btn_sync = gr.Button("Sync Now")
            sync_result = gr.JSON(label="Sync Result")

            def do_strava_sync(pp: float, ps: float, af: Optional[float]):
                try:
                    # Quick env sanity
                    missing = [k for k in ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN"] if not os.getenv(k)]
                    if missing:
                        return {"error": f"Missing env vars: {', '.join(missing)}"}
                    pp_i = int(pp) if pp is not None else 200
                    ps_i = int(ps) if ps is not None else 1
                    af_i = int(af) if af not in (None, 0) else None
                    activities = fetch_all_activities(per_page=pp_i, page_start=ps_i, after=af_i)
                    n = upsert_activities(activities)
                    return {"activities_fetched": len(activities), "activities_upserted": n}
                except Exception as e:
                    return {"error": str(e)}

            btn_sync.click(do_strava_sync, inputs=[per_page, page_start, after], outputs=[sync_result])

            gr.Markdown("## List Recent Activities")
            with gr.Row():
                limit = gr.Number(value=20, precision=0, label="limit")
                offset = gr.Number(value=0, precision=0, label="offset")
                btn_list = gr.Button("Refresh")
            df = gr.Dataframe(headers=["id", "type", "name", "start_date", "distance"], label="Activities", interactive=False)

            def list_acts(lim: float, off: float):
                return _list_strava(int(lim), int(off))

            btn_list.click(list_acts, inputs=[limit, offset], outputs=[df])

            gr.Markdown("## Authorize Strava (get refresh token)")
            with gr.Row():
                redirect_uri = gr.Textbox(value="http://localhost:8000/oauth/strava/callback", label="Redirect URI")
                scopes = gr.CheckboxGroup(choices=["read", "activity:read_all"], value=["read", "activity:read_all"], label="Scopes")
                state = gr.Textbox(value="setup1", label="State")
            btn_make_url = gr.Button("Generate Authorize URL")
            auth_url = gr.Textbox(label="Authorize URL (open in browser)")

            def do_make_url(ru: str, sc: list[str], st: str):
                try:
                    url = build_authorize_url(sc or ["read"], ru or "http://localhost:8000/oauth/strava/callback", st or "setup1", "force")
                    return url
                except Exception as e:
                    return f"Error: {e}"

            btn_make_url.click(do_make_url, inputs=[redirect_uri, scopes, state], outputs=[auth_url])

            gr.Markdown("After authorizing, copy 'code' from the callback JSON and exchange below.")
            with gr.Row():
                code_tb = gr.Textbox(label="Authorization Code")
                btn_exchange = gr.Button("Exchange Code for Tokens")
            tokens_out = gr.JSON(label="Token Response (refresh_token persisted)")

            def do_exchange(code: str, ru: str):
                try:
                    if not code:
                        return {"error": "Code is required"}
                    payload = exchange_code_for_tokens(code, ru or "http://localhost:8000/oauth/strava/callback")
                    # Already persisted in exchange_code_for_tokens; also return current stored refresh token
                    return {**payload, "stored_refresh_token": get_refresh_token()}
                except Exception as e:
                    return {"error": str(e)}

            btn_exchange.click(do_exchange, inputs=[code_tb, redirect_uri], outputs=[tokens_out])

            gr.Markdown("## Reset Stored Strava Token")
            with gr.Row():
                new_rt = gr.Textbox(label="New Refresh Token (optional)")
                btn_reset = gr.Button("Reset / Replace Token")
            reset_out = gr.JSON(label="Reset Result")

            def do_reset(rt: str):
                try:
                    val = rt.strip() if rt else None
                    reset_refresh_token(val if val else None)
                    return {"ok": True, "stored_refresh_token": bool(get_refresh_token())}
                except Exception as e:
                    return {"error": str(e)}

            btn_reset.click(do_reset, inputs=[new_rt], outputs=[reset_out])

        with gr.Tab("TickTick"):
            gr.Markdown("## Projects")
            btn_projects = gr.Button("List Projects")
            projects_json = gr.JSON(label="Projects")

            gr.Markdown("### Project Picker")
            with gr.Row():
                btn_load_projects = gr.Button("Load Projects")
                project_dd = gr.Dropdown(choices=[], label="Project", interactive=True)
                btn_sync_selected = gr.Button("Sync Selected")
            proj_map = gr.State({})  # label -> id mapping

            def do_projects():
                try:
                    missing = [k for k in ["TICKTICK_CLIENT_ID", "TICKTICK_CLIENT_SECRET"] if not os.getenv(k)]
                    if missing:
                        return {"error": f"Missing env vars: {', '.join(missing)}"}
                    # Don't require env refresh token if stored token exists
                    return tt_list_projects()
                except Exception as e:
                    return {"error": str(e)}

            btn_projects.click(do_projects, outputs=[projects_json])

            def do_load_projects():
                try:
                    projs = tt_list_projects()
                    labels = []
                    mapping = {}
                    for p in projs:
                        if isinstance(p, dict) and p.get("id"):
                            name = p.get("name") or p.get("projectName") or "(unnamed)"
                            label = f"{name} [{p['id']}]"
                            labels.append(label)
                            mapping[label] = p["id"]
                    default_label = labels[0] if labels else None
                    return gr.update(choices=labels, value=default_label), projs, mapping
                except Exception as e:
                    return gr.update(choices=[], value=None), {"error": str(e)}, {}

            btn_load_projects.click(do_load_projects, outputs=[project_dd, projects_json, proj_map])

            gr.Markdown("## Sync Project Tasks")
            with gr.Row():
                project_id = gr.Textbox(value="", label="Project ID")
                btn_tt_sync = gr.Button("Sync Tasks")
            tt_sync_result = gr.JSON(label="Sync Result")

            def do_tt_sync(pid: str):
                try:
                    if not pid:
                        return {"error": "Project ID is required"}
                    tasks = tt_get_tasks(pid)
                    n = tt_upsert(tasks)
                    return {"projectId": pid, "tasks_fetched": len(tasks), "tasks_upserted": n}
                except Exception as e:
                    return {"error": str(e)}

            btn_tt_sync.click(do_tt_sync, inputs=[project_id], outputs=[tt_sync_result])

            def do_tt_sync_selected(selected_label: str | None, mapping: dict):
                try:
                    if not selected_label:
                        return {"error": "Select a project first"}
                    pid = mapping.get(selected_label)
                    if not pid:
                        # Fallback: try to extract ID from label suffix [...]
                        import re
                        m = re.search(r"\[(.+?)\]$", selected_label)
                        pid = m.group(1) if m else None
                    if not pid:
                        return {"error": "Could not resolve project id"}
                    tasks = tt_get_tasks(pid)
                    n = tt_upsert(tasks)
                    return {"projectId": pid, "tasks_fetched": len(tasks), "tasks_upserted": n}
                except Exception as e:
                    return {"error": str(e)}

            btn_sync_selected.click(do_tt_sync_selected, inputs=[project_dd, proj_map], outputs=[tt_sync_result])

            gr.Markdown("### Test TickTick Token")
            btn_test_tt = gr.Button("Test Token Refresh + List Projects")
            test_tt_out = gr.JSON(label="Result")

            def do_test_tt():
                try:
                    projs = tt_list_projects()
                    cnt = len(projs) if isinstance(projs, list) else 0
                    return {"ok": True, "projects_count": cnt}
                except Exception as e:
                    return {"error": str(e)}

            btn_test_tt.click(do_test_tt, outputs=[test_tt_out])

            gr.Markdown("## Authorize TickTick (get refresh token)")
            with gr.Row():
                tt_redirect_uri = gr.Textbox(value="http://localhost:8000/oauth/ticktick/callback", label="Redirect URI")
                tt_state = gr.Textbox(value="setup1", label="State")
                tt_scope = gr.Textbox(value="tasks:read tasks:write", label="Scope")
            btn_tt_make_url = gr.Button("Generate Authorize URL")
            tt_auth_url = gr.Textbox(label="Authorize URL (open in browser)")

            def do_tt_make_url(ru: str, st: str, sc: str):
                try:
                    return tt_build_authorize_url(ru or "http://localhost:8000/oauth/ticktick/callback", st or "setup1", sc or None)
                except Exception as e:
                    return f"Error: {e}"

            btn_tt_make_url.click(do_tt_make_url, inputs=[tt_redirect_uri, tt_state, tt_scope], outputs=[tt_auth_url])

            gr.Markdown("After authorizing, copy 'code' from the callback JSON and exchange below.")
            with gr.Row():
                tt_code_tb = gr.Textbox(label="Authorization Code")
                btn_tt_exchange = gr.Button("Exchange Code for Tokens")
            tt_tokens_out = gr.JSON(label="Token Response (refresh_token persisted)")

            def do_tt_exchange(code: str, ru: str):
                try:
                    if not code:
                        return {"error": "Code is required"}
                    payload = tt_exchange_code(code, ru or "http://localhost:8000/oauth/ticktick/callback")
                    return {**payload, "stored_refresh_token": bool(tt_get_tt_refresh())}
                except Exception as e:
                    return {"error": str(e)}

            btn_tt_exchange.click(do_tt_exchange, inputs=[tt_code_tb, tt_redirect_uri], outputs=[tt_tokens_out])

            gr.Markdown("## Reset Stored TickTick Token")
            with gr.Row():
                tt_new_rt = gr.Textbox(label="New Refresh Token (optional)")
                btn_tt_reset = gr.Button("Reset / Replace Token")
            tt_reset_out = gr.JSON(label="Reset Result")

            def do_tt_reset(rt: str):
                try:
                    val = rt.strip() if rt else None
                    tt_reset_refresh(val if val else None)
                    return {"ok": True, "stored_refresh_token": bool(tt_get_tt_refresh())}
                except Exception as e:
                    return {"error": str(e)}

            btn_tt_reset.click(do_tt_reset, inputs=[tt_new_rt], outputs=[tt_reset_out])

        with gr.Tab("Metrics"):
            gr.Markdown("## Upsert Daily Metrics")
            with gr.Row():
                day = gr.Textbox(label="Day (YYYY-MM-DD)")
                calorie_in = gr.Number(value=2000, precision=0, label="Calorie In")
                calorie_out = gr.Number(value=500, precision=0, label="Calorie Out")
                protein_g = gr.Number(value=150, precision=0, label="Protein (g)")
                weight_kg = gr.Number(value=75.0, label="Weight (kg)")
            notes = gr.Textbox(label="Notes", value="")
            btn_upsert = gr.Button("Save")
            upsert_out = gr.JSON(label="Saved Row")

            def do_upsert(d: str, ci: float, co: float, pg: float, wk: float, n: str | None):
                try:
                    row = _upsert_metrics(d, int(ci), int(co), int(pg), float(wk), n if n else None)
                    return row
                except Exception as e:
                    return {"error": str(e)}

            btn_upsert.click(do_upsert, inputs=[day, calorie_in, calorie_out, protein_g, weight_kg, notes], outputs=[upsert_out])

            gr.Markdown("## List Metrics")
            with gr.Row():
                start = gr.Textbox(label="Start (YYYY-MM-DD)")
                end = gr.Textbox(label="End (YYYY-MM-DD)")
                m_limit = gr.Number(value=30, precision=0, label="Limit")
                btn_list_m = gr.Button("Refresh")
            df_m = gr.Dataframe(headers=["day", "calorie_in", "calorie_out", "protein_g", "weight_kg", "notes"], label="Metrics", interactive=False)

            def do_list_metrics(s: Optional[str], e: Optional[str], lim: float):
                try:
                    return _list_metrics(s or None, e or None, int(lim))
                except Exception as e:
                    return {"error": str(e)}

        with gr.Tab("Env Check"):
            gr.Markdown("## Environment & Connectivity")
            btn_check = gr.Button("Check Now")
            env_out = gr.JSON(label="Status")

            def do_env_check():
                status = {
                    "DATABASE_URL": bool(os.getenv("DATABASE_URL")),
                    "STRAVA_CLIENT_ID": bool(os.getenv("STRAVA_CLIENT_ID")),
                    "STRAVA_CLIENT_SECRET": bool(os.getenv("STRAVA_CLIENT_SECRET")),
                    "STRAVA_REFRESH_TOKEN": bool(os.getenv("STRAVA_REFRESH_TOKEN")),
                    "TICKTICK_CLIENT_ID": bool(os.getenv("TICKTICK_CLIENT_ID")),
                    "TICKTICK_CLIENT_SECRET": bool(os.getenv("TICKTICK_CLIENT_SECRET")),
                    "TICKTICK_REFRESH_TOKEN": bool(os.getenv("TICKTICK_REFRESH_TOKEN")),
                }
                # basic DB connection test
                try:
                    with db() as conn:
                        with conn.cursor() as cur:
                            cur.execute("select 1 as ok")
                            _ = cur.fetchone()
                    status["db_connect"] = True
                except Exception as e:
                    status["db_connect"] = f"Error: {e}"
                # stored tokens
                try:
                    status["strava_stored_refresh_token"] = bool(get_refresh_token())
                except Exception as e:
                    status["strava_stored_refresh_token"] = f"Error: {e}"
                try:
                    status["ticktick_stored_refresh_token"] = bool(tt_get_tt_refresh())
                except Exception as e:
                    status["ticktick_stored_refresh_token"] = f"Error: {e}"
                return status

            btn_check.click(do_env_check, outputs=[env_out])

            btn_list_m.click(do_list_metrics, inputs=[start, end, m_limit], outputs=[df_m])

    return demo
