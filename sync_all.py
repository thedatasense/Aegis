#!/usr/bin/env python3
"""
Aegis Sync Script - Automated data synchronization for Strava and TickTick
This script is designed to be run as a cron job for regular data updates.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import traceback

# Add the app directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db import db, init_schema
from app.strava import fetch_all_activities, upsert_activities
from app.ticktick import list_projects, get_project_tasks, upsert_tasks

# Configure logging
def setup_logging(log_file: Optional[str] = None, verbose: bool = False):
    """Set up logging configuration for cron execution."""
    log_level = logging.DEBUG if verbose else logging.INFO
    log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    handlers = []
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    handlers.append(console_handler)
    
    # File handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file, mode='a')
        file_handler.setLevel(log_level)
        handlers.append(file_handler)
    
    logging.basicConfig(
        level=log_level,
        format=log_format,
        handlers=handlers
    )
    
    return logging.getLogger(__name__)


def sync_strava(days_back: int = 30, logger: logging.Logger = None) -> Dict[str, any]:
    """
    Sync Strava activities for the specified number of days.
    
    Args:
        days_back: Number of days to look back for activities
        logger: Logger instance
    
    Returns:
        Dictionary with sync results
    """
    logger = logger or logging.getLogger(__name__)
    results = {
        'status': 'success',
        'activities_synced': 0,
        'errors': []
    }
    
    try:
        logger.info(f"Starting Strava sync for last {days_back} days")
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        # Fetch activities
        activities = fetch_all_activities(
            after=int(start_date.timestamp())
        )
        
        if not activities:
            logger.info("No Strava activities found in date range")
            return results
        
        # Upsert to database
        count = upsert_activities(activities)
        results['activities_synced'] = count
        logger.info(f"Successfully synced {count} Strava activities")
        
    except Exception as e:
        error_msg = f"Strava sync failed: {str(e)}"
        logger.error(error_msg)
        logger.debug(traceback.format_exc())
        results['status'] = 'error'
        results['errors'].append(error_msg)
    
    return results


def sync_ticktick(project_ids: Optional[List[str]] = None, logger: logging.Logger = None) -> Dict[str, any]:
    """
    Sync TickTick tasks for specified projects or all projects.
    
    Args:
        project_ids: List of project IDs to sync, or None for all projects
        logger: Logger instance
    
    Returns:
        Dictionary with sync results
    """
    logger = logger or logging.getLogger(__name__)
    results = {
        'status': 'success',
        'tasks_synced': 0,
        'projects_synced': 0,
        'errors': []
    }
    
    try:
        logger.info("Starting TickTick sync")
        
        # Get projects to sync
        if project_ids:
            projects_to_sync = [{'id': pid} for pid in project_ids]
            logger.info(f"Syncing specific projects: {project_ids}")
        else:
            projects = list_projects()
            projects_to_sync = projects
            logger.info(f"Found {len(projects)} TickTick projects to sync")
        
        # Sync each project
        total_tasks = 0
        for project in projects_to_sync:
            try:
                project_id = project['id']
                logger.debug(f"Syncing project: {project_id}")
                
                tasks = get_project_tasks(project_id)
                if tasks:
                    count = upsert_tasks(tasks)
                    total_tasks += count
                    results['projects_synced'] += 1
                    logger.debug(f"Synced {count} tasks from project {project_id}")
                
            except Exception as e:
                error_msg = f"Failed to sync project {project_id}: {str(e)}"
                logger.error(error_msg)
                results['errors'].append(error_msg)
        
        results['tasks_synced'] = total_tasks
        logger.info(f"Successfully synced {total_tasks} tasks from {results['projects_synced']} projects")
        
    except Exception as e:
        error_msg = f"TickTick sync failed: {str(e)}"
        logger.error(error_msg)
        logger.debug(traceback.format_exc())
        results['status'] = 'error'
        results['errors'].append(error_msg)
    
    return results


def save_sync_status(results: Dict[str, any], status_file: str = None):
    """Save sync results to a JSON file for monitoring."""
    if not status_file:
        return
    
    status = {
        'last_sync': datetime.now().isoformat(),
        'results': results
    }
    
    try:
        with open(status_file, 'w') as f:
            json.dump(status, f, indent=2)
    except Exception as e:
        logging.error(f"Failed to save status file: {e}")


def main():
    """Main entry point for the sync script."""
    parser = argparse.ArgumentParser(
        description='Sync data from Strava and TickTick to Aegis database'
    )
    
    # Sync options
    parser.add_argument(
        '--strava-days',
        type=int,
        default=30,
        help='Number of days to sync from Strava (default: 30)'
    )
    parser.add_argument(
        '--ticktick-projects',
        nargs='*',
        help='Specific TickTick project IDs to sync (default: all projects)'
    )
    parser.add_argument(
        '--skip-strava',
        action='store_true',
        help='Skip Strava sync'
    )
    parser.add_argument(
        '--skip-ticktick',
        action='store_true',
        help='Skip TickTick sync'
    )
    
    # Logging options
    parser.add_argument(
        '--log-file',
        help='Log file path for cron execution'
    )
    parser.add_argument(
        '--status-file',
        help='JSON file to save sync status'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    # Database options
    parser.add_argument(
        '--init-db',
        action='store_true',
        help='Initialize database schema before syncing'
    )
    
    args = parser.parse_args()
    
    # Set up logging
    logger = setup_logging(args.log_file, args.verbose)
    logger.info("=== Aegis Sync Started ===")
    logger.info(f"Arguments: {vars(args)}")
    
    # Initialize database if requested
    if args.init_db:
        logger.info("Initializing database schema")
        try:
            init_schema()
            logger.info("Database schema initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            sys.exit(1)
    
    # Collect all results
    all_results = {
        'strava': None,
        'ticktick': None,
        'overall_status': 'success'
    }
    
    # Sync Strava
    if not args.skip_strava:
        logger.info("--- Syncing Strava ---")
        strava_results = sync_strava(args.strava_days, logger)
        all_results['strava'] = strava_results
        if strava_results['status'] == 'error':
            all_results['overall_status'] = 'partial_failure'
    else:
        logger.info("Skipping Strava sync")
    
    # Sync TickTick
    if not args.skip_ticktick:
        logger.info("--- Syncing TickTick ---")
        ticktick_results = sync_ticktick(args.ticktick_projects, logger)
        all_results['ticktick'] = ticktick_results
        if ticktick_results['status'] == 'error':
            all_results['overall_status'] = 'partial_failure'
    else:
        logger.info("Skipping TickTick sync")
    
    # Check if both failed
    if (all_results['strava'] and all_results['strava']['status'] == 'error' and
        all_results['ticktick'] and all_results['ticktick']['status'] == 'error'):
        all_results['overall_status'] = 'failure'
    
    # Save status if requested
    if args.status_file:
        save_sync_status(all_results, args.status_file)
    
    # Summary
    logger.info("=== Sync Summary ===")
    if all_results['strava']:
        logger.info(f"Strava: {all_results['strava']['activities_synced']} activities synced")
        if all_results['strava']['errors']:
            logger.error(f"Strava errors: {all_results['strava']['errors']}")
    
    if all_results['ticktick']:
        logger.info(f"TickTick: {all_results['ticktick']['tasks_synced']} tasks from "
                   f"{all_results['ticktick']['projects_synced']} projects synced")
        if all_results['ticktick']['errors']:
            logger.error(f"TickTick errors: {all_results['ticktick']['errors']}")
    
    logger.info(f"Overall status: {all_results['overall_status']}")
    logger.info("=== Aegis Sync Completed ===")
    
    # Exit with appropriate code
    if all_results['overall_status'] == 'failure':
        sys.exit(1)
    elif all_results['overall_status'] == 'partial_failure':
        sys.exit(2)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()