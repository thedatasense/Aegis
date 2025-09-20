#!/usr/bin/env python3
"""Fast MCP server for Aegis using FastMCP framework."""

import os
import sys
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables first
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / '.env')

from fastmcp import FastMCP, Context
from fastmcp.tools import tool

# Import Aegis modules directly
from app.db import db, init_schema
from app.strava import get_strava_data, refresh_strava_token
from app.ticktick import get_ticktick_data, refresh_ticktick_token, create_task
from app.models import DailyMetrics

# Initialize FastMCP server
mcp = FastMCP("aegis-fast")

# Initialize database on startup
try:
    init_schema()
except Exception as e:
    print(f"Warning: Could not initialize database schema: {e}", file=sys.stderr)

@tool
async def get_strava_activities(
    context: Context,
    limit: Optional[int] = None,
    activity_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> str:
    """
    Query Strava activities with optional filters.
    
    Args:
        limit: Number of activities to return
        activity_type: Filter by activity type (e.g., Run, Ride, Swim)
        start_date: Filter activities after this date (ISO format)
        end_date: Filter activities before this date (ISO format)
    """
    with db() as conn:
        with conn.cursor() as cur:
            query = "SELECT * FROM strava_activities WHERE 1=1"
            params = []
            
            if activity_type:
                query += " AND type = %s"
                params.append(activity_type)
            if start_date:
                query += " AND start_date >= %s"
                params.append(start_date)
            if end_date:
                query += " AND start_date <= %s"
                params.append(end_date)
            
            query += " ORDER BY start_date DESC"
            
            if limit:
                query += " LIMIT %s"
                params.append(limit)
            
            cur.execute(query, params)
            activities = []
            for row in cur.fetchall():
                activity = dict(zip([col.name for col in cur.description], row))
                # Add converted units
                if activity.get("distance"):
                    activity["distance_miles"] = round(activity["distance"] * 0.000621371, 2)
                    activity["distance_km"] = round(activity["distance"] / 1000, 2)
                if activity.get("average_speed"):
                    activity["average_speed_mph"] = round(activity["average_speed"] * 2.23694, 2)
                    activity["average_speed_kph"] = round(activity["average_speed"] * 3.6, 2)
                activities.append(activity)
            
            return json.dumps(activities, indent=2, default=str)

@tool
async def sync_strava_activities(context: Context, force: bool = False) -> str:
    """
    Sync latest activities from Strava API.
    
    Args:
        force: Force sync even if recently synced
    """
    try:
        # Refresh token
        refresh_strava_token()
        
        # Get activities from last 30 days
        activities = get_strava_data(after_days=30)
        
        # Upsert to database
        count = 0
        with db() as conn:
            with conn.cursor() as cur:
                for activity in activities:
                    cur.execute("""
                        INSERT INTO strava_activities (
                            id, name, type, sport_type, start_date, start_date_local,
                            timezone, distance, moving_time, elapsed_time,
                            total_elevation_gain, average_speed, max_speed,
                            average_heartrate, max_heartrate, kilojoules
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            name = EXCLUDED.name,
                            distance = EXCLUDED.distance,
                            moving_time = EXCLUDED.moving_time,
                            average_heartrate = EXCLUDED.average_heartrate,
                            kilojoules = EXCLUDED.kilojoules,
                            updated_at = NOW()
                    """, (
                        activity.get('id'),
                        activity.get('name'),
                        activity.get('type'),
                        activity.get('sport_type'),
                        activity.get('start_date'),
                        activity.get('start_date_local'),
                        activity.get('timezone'),
                        activity.get('distance'),
                        activity.get('moving_time'),
                        activity.get('elapsed_time'),
                        activity.get('total_elevation_gain'),
                        activity.get('average_speed'),
                        activity.get('max_speed'),
                        activity.get('average_heartrate'),
                        activity.get('max_heartrate'),
                        activity.get('kilojoules')
                    ))
                    count += 1
        
        return f"Successfully synced {count} Strava activities"
    except Exception as e:
        return f"Error syncing Strava: {str(e)}"

@tool
async def get_ticktick_tasks(
    context: Context,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> str:
    """
    Query TickTick tasks with optional filters.
    
    Args:
        project_id: Filter by project ID
        status: Filter by status (completed, pending)
        limit: Number of tasks to return
        start_date: Filter tasks after this date
        end_date: Filter tasks before this date
    """
    with db() as conn:
        with conn.cursor() as cur:
            query = "SELECT * FROM ticktick_tasks WHERE 1=1"
            params = []
            
            if project_id:
                query += " AND project_id = %s"
                params.append(project_id)
            if status == "completed":
                query += " AND status = '2'"
            elif status == "pending":
                query += " AND status != '2'"
            if start_date:
                query += " AND (due_date >= %s OR start_date >= %s)"
                params.extend([start_date, start_date])
            if end_date:
                query += " AND (due_date <= %s OR start_date <= %s)"
                params.extend([end_date, end_date])
            
            query += " ORDER BY due_date DESC NULLS LAST"
            
            if limit:
                query += " LIMIT %s"
                params.append(limit)
            
            cur.execute(query, params)
            tasks = []
            for row in cur.fetchall():
                task = dict(zip([col.name for col in cur.description], row))
                tasks.append(task)
            
            return json.dumps(tasks, indent=2, default=str)

@tool
async def sync_ticktick_tasks(context: Context, project_id: str) -> str:
    """
    Sync tasks from TickTick API for a specific project.
    
    Args:
        project_id: Project ID to sync (required)
    """
    try:
        # Refresh token
        refresh_ticktick_token()
        
        # Get tasks for project
        tasks = get_ticktick_data(project_id)
        
        # Upsert to database
        count = 0
        with db() as conn:
            with conn.cursor() as cur:
                for task in tasks:
                    cur.execute("""
                        INSERT INTO ticktick_tasks (
                            id, project_id, title, content, desc,
                            is_all_day, start_date, due_date, time_zone,
                            repeat_flag, reminders, priority, status,
                            completed_time, tags, created_time, modified_time
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            title = EXCLUDED.title,
                            content = EXCLUDED.content,
                            status = EXCLUDED.status,
                            completed_time = EXCLUDED.completed_time,
                            modified_time = EXCLUDED.modified_time,
                            updated_at = NOW()
                    """, (
                        task.get('id'),
                        task.get('projectId'),
                        task.get('title'),
                        task.get('content'),
                        task.get('desc'),
                        task.get('isAllDay'),
                        task.get('startDate'),
                        task.get('dueDate'),
                        task.get('timeZone'),
                        task.get('repeatFlag'),
                        json.dumps(task.get('reminders', [])),
                        task.get('priority', 0),
                        str(task.get('status', 0)),
                        task.get('completedTime'),
                        task.get('tags', []),
                        task.get('createdTime'),
                        task.get('modifiedTime')
                    ))
                    count += 1
        
        return f"Successfully synced {count} tasks for project {project_id}"
    except Exception as e:
        return f"Error syncing TickTick: {str(e)}"

@tool
async def get_daily_metrics(
    context: Context,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> str:
    """
    Get daily health metrics for a date range.
    
    Args:
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD)
    """
    with db() as conn:
        with conn.cursor() as cur:
            query = "SELECT * FROM daily_metrics WHERE 1=1"
            params = []
            
            if start_date:
                query += " AND day >= %s"
                params.append(start_date)
            if end_date:
                query += " AND day <= %s"
                params.append(end_date)
            
            query += " ORDER BY day DESC"
            
            cur.execute(query, params)
            metrics = []
            for row in cur.fetchall():
                metric = dict(zip([col.name for col in cur.description], row))
                metrics.append(metric)
            
            return json.dumps(metrics, indent=2, default=str)

@tool
async def update_daily_metrics(
    context: Context,
    day: str,
    calorie_in: Optional[int] = None,
    calorie_out: Optional[int] = None,
    protein_g: Optional[int] = None,
    weight_kg: Optional[float] = None,
    notes: Optional[str] = None
) -> str:
    """
    Update or insert daily health metrics.
    
    Args:
        day: Date (YYYY-MM-DD) - required
        calorie_in: Calories consumed
        calorie_out: Calories burned
        protein_g: Protein intake in grams
        weight_kg: Body weight in kg
        notes: Notes for the day
    """
    metrics = DailyMetrics(
        day=day,
        calorie_in=calorie_in,
        calorie_out=calorie_out,
        protein_g=protein_g,
        weight_kg=weight_kg,
        notes=notes
    )
    
    with db() as conn:
        with conn.cursor() as cur:
            fields = []
            values = []
            
            # Build dynamic query based on provided fields
            fields.append("day")
            values.append(metrics.day)
            
            if metrics.calorie_in is not None:
                fields.append("calorie_in")
                values.append(metrics.calorie_in)
            if metrics.calorie_out is not None:
                fields.append("calorie_out")
                values.append(metrics.calorie_out)
            if metrics.protein_g is not None:
                fields.append("protein_g")
                values.append(metrics.protein_g)
            if metrics.weight_kg is not None:
                fields.append("weight_kg")
                values.append(metrics.weight_kg)
            if metrics.notes is not None:
                fields.append("notes")
                values.append(metrics.notes)
            
            # Create update clause
            update_fields = [f"{f} = EXCLUDED.{f}" for f in fields if f != "day"]
            update_fields.append("updated_at = NOW()")
            
            query = f"""
                INSERT INTO daily_metrics ({', '.join(fields)})
                VALUES ({', '.join(['%s'] * len(values))})
                ON CONFLICT (day) DO UPDATE SET {', '.join(update_fields)}
                RETURNING *
            """
            
            cur.execute(query, values)
            result = cur.fetchone()
            updated = dict(zip([col.name for col in cur.description], result))
            
            return f"Successfully updated metrics for {metrics.day}:\n{json.dumps(updated, indent=2, default=str)}"

@tool
async def analyze_fitness_trends(
    context: Context,
    days: int = 30,
    metrics: Optional[List[str]] = None
) -> str:
    """
    Analyze fitness trends and provide insights.
    
    Args:
        days: Number of days to analyze (default: 30)
        metrics: Specific metrics to analyze
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    with db() as conn:
        with conn.cursor() as cur:
            # Get activity stats
            cur.execute("""
                SELECT type, COUNT(*) as count, 
                       SUM(distance) as total_distance,
                       SUM(moving_time) as total_time,
                       AVG(average_heartrate) as avg_hr,
                       SUM(kilojoules) as total_energy
                FROM strava_activities 
                WHERE start_date >= %s AND start_date <= %s
                GROUP BY type
            """, (start_date.isoformat(), end_date.isoformat()))
            
            activities = []
            for row in cur.fetchall():
                activity = dict(zip([col.name for col in cur.description], row))
                activities.append(activity)
            
            # Get metrics stats
            cur.execute("""
                SELECT AVG(calorie_in) as avg_calories_in,
                       AVG(calorie_out) as avg_calories_out,
                       AVG(protein_g) as avg_protein,
                       AVG(weight_kg) as avg_weight,
                       MIN(weight_kg) as min_weight,
                       MAX(weight_kg) as max_weight
                FROM daily_metrics
                WHERE day >= %s AND day <= %s
            """, (start_date.date().isoformat(), end_date.date().isoformat()))
            
            metrics_row = cur.fetchone()
            metrics_data = dict(zip([col.name for col in cur.description], metrics_row)) if metrics_row else {}
            
            # Build analysis
            analysis = {
                "period": f"{days} days ({start_date.strftime('%Y-%m-%d')} - {end_date.strftime('%Y-%m-%d')})",
                "activities": activities,
                "nutrition_metrics": metrics_data,
                "insights": []
            }
            
            # Generate insights
            if metrics_data.get("avg_weight") and metrics_data.get("min_weight") and metrics_data.get("max_weight"):
                weight_change = metrics_data["max_weight"] - metrics_data["min_weight"]
                analysis["insights"].append(f"Weight variation: {weight_change:.1f} kg")
            
            if metrics_data.get("avg_calories_in") and metrics_data.get("avg_calories_out"):
                deficit = metrics_data["avg_calories_out"] - metrics_data["avg_calories_in"]
                analysis["insights"].append(
                    f"Average daily calorie {'deficit' if deficit > 0 else 'surplus'}: {abs(deficit):.0f} calories"
                )
            
            # Activity insights
            total_activities = sum(a["count"] for a in activities)
            if total_activities > 0:
                analysis["insights"].append(f"Total activities: {total_activities}")
                analysis["insights"].append(f"Average activities per week: {(total_activities / days * 7):.1f}")
            
            return json.dumps(analysis, indent=2, default=str)

@tool
async def create_ticktick_task(
    context: Context,
    title: str,
    project_id: Optional[str] = None,
    content: Optional[str] = None,
    due_date: Optional[str] = None,
    priority: int = 0,
    tags: Optional[List[str]] = None
) -> str:
    """
    Create a new task in TickTick.
    
    Args:
        title: Task title (required)
        project_id: Project ID to create task in
        content: Task content/description
        due_date: Task due date (ISO format)
        priority: Task priority (0=none, 1=low, 3=medium, 5=high)
        tags: Task tags
    """
    try:
        # Refresh token
        refresh_ticktick_token()
        
        # Create task via API
        task = create_task(
            title=title,
            project_id=project_id,
            content=content,
            due_date=due_date,
            priority=priority,
            tags=tags or []
        )
        
        # Insert into database
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO ticktick_tasks (
                        id, project_id, title, content, desc,
                        is_all_day, start_date, due_date, time_zone,
                        priority, status, tags, created_time, modified_time
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        title = EXCLUDED.title,
                        updated_at = NOW()
                """, (
                    task.get('id'),
                    task.get('projectId'),
                    task.get('title'),
                    task.get('content'),
                    task.get('desc'),
                    task.get('isAllDay', True),
                    task.get('startDate'),
                    task.get('dueDate'),
                    task.get('timeZone', 'UTC'),
                    task.get('priority', 0),
                    str(task.get('status', 0)),
                    task.get('tags', []),
                    task.get('createdTime'),
                    task.get('modifiedTime')
                ))
        
        return f"Successfully created TickTick task:\n{json.dumps(task, indent=2, default=str)}"
    except Exception as e:
        return f"Error creating task: {str(e)}"

# This will be the entry point for FastMCP
if __name__ == "__main__":
    import asyncio
    asyncio.run(mcp.run())