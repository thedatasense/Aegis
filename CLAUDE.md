# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aegis is a Python-based fitness and productivity tracking application that syncs data from Strava (fitness activities) and TickTick (task management) into a PostgreSQL database. It provides both a REST API (FastAPI) and a web UI (Gradio) for managing and visualizing personal health metrics, activities, and tasks.

## Architecture

### Tech Stack
- **Backend**: FastAPI web framework
- **UI**: Gradio for web interface
- **Database**: PostgreSQL (Neon-hosted)
- **Python**: 3.x with type hints
- **Dependencies**: See requirements.txt

### Core Components

1. **app/main.py**: FastAPI application entry point
   - Mounts Gradio UI at `/ui`
   - Provides REST endpoints for syncing and querying data
   - Handles periodic Strava sync if configured

2. **app/db.py**: Database connection management
   - Uses psycopg3 with connection pooling
   - Context manager pattern for transactions
   - Auto-creates schema on startup

3. **app/strava.py**: Strava API integration
   - OAuth refresh token flow
   - Fetches activity data
   - Upserts to strava_activities table

4. **app/ticktick.py**: TickTick API integration
   - OAuth refresh token flow
   - Fetches project and task data
   - Upserts to ticktick_tasks table

5. **app/ui.py**: Gradio web interface
   - Tabs for Strava, TickTick, Metrics, and Environment checks
   - Interactive forms for data entry and syncing

6. **app/models.py**: Pydantic models for API validation

### Database Schema

Three main tables (defined in sql/schema.sql):
- `strava_activities`: Fitness activities with metrics
- `ticktick_tasks`: Task management data
- `daily_metrics`: Manual health tracking (calories, protein, weight)

## Development Commands

### Setup
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On macOS/Linux
# .venv\Scripts\activate  # On Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.sample .env
# Edit .env with your credentials
```

### Running the Application
```bash
# Start the FastAPI server with auto-reload
uvicorn app.main:app --reload

# The API will be available at http://localhost:8000
# The Gradio UI will be at http://localhost:8000/ui
# API docs at http://localhost:8000/docs
```

### Environment Variables
Required in `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`
- `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, `TICKTICK_REFRESH_TOKEN`
- Optional: `STRAVA_SYNC_INTERVAL_MINUTES` for periodic sync

### Testing
No formal test suite exists yet. Manual testing via:
- Gradio UI at `/ui`
- FastAPI interactive docs at `/docs`
- Direct API calls

### Common Development Tasks

1. **Add new API endpoint**: Edit `app/main.py`
2. **Modify database schema**: 
   - Update `sql/schema.sql`
   - Update `app/db.py:init_schema()`
3. **Add UI components**: Edit `app/ui.py:build_ui()`
4. **Add new integrations**: Create new module in `app/` following strava.py/ticktick.py patterns

### API Endpoints

- `GET /health`: Health check
- `POST /sync/strava`: Sync Strava activities
- `GET /strava/activities`: List activities
- `GET /ticktick/projects`: List TickTick projects
- `POST /sync/ticktick/{project_id}`: Sync tasks for a project
- `POST /metrics`: Upsert daily health metrics
- `GET /metrics`: Query metrics with date filters

### Database Operations

The app uses transaction-safe database operations:
```python
from app.db import db

with db() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM daily_metrics")
        rows = cur.fetchall()
```

All database operations auto-commit on success and rollback on exception.