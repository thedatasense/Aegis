import os
import time
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv


# Ensure environment variables from a local .env are available even when this
# module is imported outside the FastAPI startup lifecycle (e.g., direct UI
# callbacks, ad-hoc scripts, etc.). Safe no-op if .env is absent.
load_dotenv()

DATABASE_URL_ENV = "DATABASE_URL"


def get_db_url() -> str:
    url = os.getenv(DATABASE_URL_ENV)
    if not url:
        raise RuntimeError(f"Missing env: {DATABASE_URL_ENV}")
    return url


def connect() -> psycopg.Connection:
    return psycopg.connect(get_db_url(), autocommit=False, row_factory=dict_row)


@contextmanager
def db() -> Iterator[psycopg.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema() -> None:
    """Create tables if they do not exist."""
    stmt = """
    create table if not exists strava_activities (
      id bigint primary key,
      type text,
      name text,
      distance double precision,
      moving_time integer,
      elapsed_time integer,
      total_elevation_gain double precision,
      start_date timestamptz,
      start_latlng jsonb,
      kilojoules double precision,
      average_heartrate double precision,
      max_heartrate double precision,
      elev_high double precision,
      elev_low double precision,
      average_speed double precision,
      max_speed double precision,
      raw jsonb,
      last_synced_at timestamptz default now()
    );

    create table if not exists ticktick_tasks (
      id text primary key,
      project_id text,
      title text,
      content text,
      "desc" text,
      is_all_day boolean,
      start_date timestamptz,
      due_date timestamptz,
      time_zone text,
      repeat_flag text,
      reminders jsonb,
      priority integer,
      status text,
      completed_time timestamptz,
      sort_order bigint,
      items jsonb,
      tags text[],
      modified_time timestamptz,
      created_time timestamptz,
      deleted boolean,
      etag text,
      raw jsonb,
      last_synced_at timestamptz default now()
    );

    create table if not exists daily_metrics (
      day date primary key,
      calorie_in integer,
      calorie_out integer,
      protein_g integer,
      weight_kg numeric(6,2),
      notes text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table if not exists oauth_tokens (
      provider text primary key,
      refresh_token text,
      access_token text,
      access_expires_at timestamptz,
      updated_at timestamptz default now()
    );

    -- Ensure refresh_token can be null for providers that don't return it
    do $$ begin
      if exists (
        select 1 from information_schema.columns
        where table_name = 'oauth_tokens' and column_name = 'refresh_token' and is_nullable = 'NO'
      ) then
        execute 'alter table oauth_tokens alter column refresh_token drop not null';
      end if;
    end $$;

    create or replace function set_updated_at()
    returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end;$$;

    drop trigger if exists trg_daily_metrics_updated on daily_metrics;
    create trigger trg_daily_metrics_updated
    before update on daily_metrics
    for each row execute procedure set_updated_at();
    """

    with db() as conn:
        with conn.cursor() as cur:
            # Retry a couple times on cold Neon starts
            for i in range(3):
                try:
                    cur.execute(stmt)
                    break
                except Exception:
                    if i == 2:
                        raise
                    time.sleep(0.5 * (i + 1))
