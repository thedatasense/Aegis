-- Neon/Postgres schema for Aegis Sync API

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

