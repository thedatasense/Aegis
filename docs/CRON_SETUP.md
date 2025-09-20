# Aegis Cron Setup Guide

This guide explains how to set up automated synchronization for Aegis using cron jobs.

## Overview

The `sync_all.py` script is designed to run as a scheduled job, automatically syncing your Strava activities and TickTick tasks at regular intervals.

## Script Features

- **Selective Syncing**: Choose to sync Strava, TickTick, or both
- **Configurable Time Range**: Specify how many days of Strava data to sync
- **Project Filtering**: Sync specific TickTick projects or all projects
- **Comprehensive Logging**: File and console logging with verbosity control
- **Status Monitoring**: Save sync status to JSON for monitoring
- **Error Handling**: Graceful error handling with appropriate exit codes

## Command Line Options

```bash
./sync_all.py [options]
```

### Sync Options
- `--strava-days N`: Number of days to sync from Strava (default: 30)
- `--ticktick-projects ID1 ID2`: Specific project IDs to sync (default: all)
- `--skip-strava`: Skip Strava synchronization
- `--skip-ticktick`: Skip TickTick synchronization

### Logging Options
- `--log-file PATH`: Write logs to file (recommended for cron)
- `--status-file PATH`: Save sync status as JSON
- `-v, --verbose`: Enable verbose logging

### Database Options
- `--init-db`: Initialize database schema (run once)

## Setting Up Cron Jobs

### 1. Basic Setup

First, ensure the script can access your environment variables:

```bash
# Create a wrapper script
cat > ~/aegis_sync_wrapper.sh << 'EOF'
#!/bin/bash
# Load environment variables
source /path/to/aegis/.env
export $(grep -v '^#' /path/to/aegis/.env | xargs)

# Activate virtual environment
source /path/to/aegis/.venv/bin/activate

# Change to project directory
cd /path/to/aegis

# Run sync script
./sync_all.py "$@"
EOF

chmod +x ~/aegis_sync_wrapper.sh
```

### 2. Cron Job Examples

Edit your crontab:
```bash
crontab -e
```

#### Example 1: Basic Daily Sync
```cron
# Sync every day at 2 AM
0 2 * * * /home/user/aegis_sync_wrapper.sh --log-file /var/log/aegis/sync.log
```

#### Example 2: Frequent Strava Updates
```cron
# Sync Strava every 2 hours during the day
0 8-22/2 * * * /home/user/aegis_sync_wrapper.sh --skip-ticktick --strava-days 1 --log-file /var/log/aegis/strava.log

# Full daily sync at night
0 3 * * * /home/user/aegis_sync_wrapper.sh --log-file /var/log/aegis/daily.log
```

#### Example 3: Different Schedules for Different Services
```cron
# Strava: Every 4 hours
0 */4 * * * /home/user/aegis_sync_wrapper.sh --skip-ticktick --log-file /var/log/aegis/strava.log

# TickTick: Twice daily
0 8,20 * * * /home/user/aegis_sync_wrapper.sh --skip-strava --log-file /var/log/aegis/ticktick.log
```

#### Example 4: Weekly Deep Sync
```cron
# Daily: Last 7 days
0 1 * * * /home/user/aegis_sync_wrapper.sh --strava-days 7 --log-file /var/log/aegis/daily.log

# Weekly: Last 60 days (Sunday at 3 AM)
0 3 * * 0 /home/user/aegis_sync_wrapper.sh --strava-days 60 --log-file /var/log/aegis/weekly.log
```

### 3. systemd Timer (Alternative to Cron)

For systemd-based systems, you can use timers instead:

Create `/etc/systemd/system/aegis-sync.service`:
```ini
[Unit]
Description=Aegis Data Sync
After=network.target

[Service]
Type=oneshot
User=your-username
WorkingDirectory=/path/to/aegis
EnvironmentFile=/path/to/aegis/.env
ExecStart=/path/to/aegis/.venv/bin/python /path/to/aegis/sync_all.py --log-file /var/log/aegis/sync.log
StandardOutput=append:/var/log/aegis/sync.log
StandardError=append:/var/log/aegis/sync.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/aegis-sync.timer`:
```ini
[Unit]
Description=Aegis Data Sync Timer
Requires=aegis-sync.service

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable aegis-sync.timer
sudo systemctl start aegis-sync.timer
```

## Monitoring and Maintenance

### 1. Log Rotation

Create `/etc/logrotate.d/aegis`:
```
/var/log/aegis/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    create 0644 user group
}
```

### 2. Status Monitoring

Use the `--status-file` option to track sync health:

```cron
# Save status for monitoring
0 * * * * /home/user/aegis_sync_wrapper.sh --status-file /var/www/aegis-status.json --log-file /var/log/aegis/sync.log
```

Create a simple monitoring script:
```bash
#!/bin/bash
# check_aegis_sync.sh

STATUS_FILE="/var/www/aegis-status.json"
MAX_AGE_HOURS=25

if [ ! -f "$STATUS_FILE" ]; then
    echo "CRITICAL: Status file not found"
    exit 2
fi

# Check file age
if [ $(find "$STATUS_FILE" -mmin +$((MAX_AGE_HOURS * 60)) | wc -l) -gt 0 ]; then
    echo "WARNING: Last sync older than $MAX_AGE_HOURS hours"
    exit 1
fi

# Check sync status
STATUS=$(jq -r '.results.overall_status' "$STATUS_FILE")
if [ "$STATUS" != "success" ]; then
    echo "CRITICAL: Last sync status: $STATUS"
    exit 2
fi

echo "OK: Sync running successfully"
exit 0
```

### 3. Email Notifications

Add email notifications for failures:

```bash
# aegis_sync_with_notify.sh
#!/bin/bash

LOG_FILE="/var/log/aegis/sync.log"
EMAIL="your-email@example.com"

# Run sync
/home/user/aegis_sync_wrapper.sh --log-file "$LOG_FILE" "$@"
EXIT_CODE=$?

# Send email on failure
if [ $EXIT_CODE -ne 0 ]; then
    tail -n 50 "$LOG_FILE" | mail -s "Aegis Sync Failed" "$EMAIL"
fi

exit $EXIT_CODE
```

## Troubleshooting

### Common Issues

1. **Environment Variables Not Found**
   - Ensure .env is sourced in wrapper script
   - Use `EnvironmentFile` in systemd service

2. **Permission Denied**
   - Check file permissions on sync script
   - Ensure log directory is writable
   - Verify database access permissions

3. **Module Import Errors**
   - Activate virtual environment in wrapper script
   - Set PYTHONPATH if needed

4. **Database Connection Issues**
   - Verify DATABASE_URL is set
   - Check network connectivity
   - Ensure database is accessible

### Debug Commands

```bash
# Test script manually
./sync_all.py --verbose

# Check cron environment
env -i /bin/bash --noprofile --norc
# Then manually run your wrapper script

# View cron logs
grep CRON /var/log/syslog

# Test specific sync
./sync_all.py --skip-strava --verbose
./sync_all.py --skip-ticktick --strava-days 1 --verbose
```

### Exit Codes

- `0`: Success
- `1`: Complete failure (both services failed)
- `2`: Partial failure (one service failed)

Use these in monitoring scripts or cron job notifications.

## Best Practices

1. **Start Simple**: Begin with daily syncs, then adjust frequency based on needs
2. **Monitor Logs**: Regularly check logs for errors or warnings
3. **Stagger Jobs**: Don't run all syncs at the same time to avoid API rate limits
4. **Keep History**: Sync more days less frequently (e.g., weekly 60-day sync)
5. **Test Manually**: Always test cron commands manually before scheduling
6. **Use Status Files**: Enable monitoring and alerting based on sync status

## Example Production Setup

```cron
# Strava: Every 2 hours during active hours (6 AM - 11 PM)
0 6-23/2 * * * /home/user/aegis_sync_with_notify.sh --skip-ticktick --strava-days 2 --status-file /var/www/status/strava.json --log-file /var/log/aegis/strava.log

# TickTick: Three times daily
0 7,13,21 * * * /home/user/aegis_sync_with_notify.sh --skip-strava --status-file /var/www/status/ticktick.json --log-file /var/log/aegis/ticktick.log

# Full sync: Daily at 3 AM
0 3 * * * /home/user/aegis_sync_with_notify.sh --strava-days 7 --status-file /var/www/status/daily.json --log-file /var/log/aegis/daily.log

# Deep sync: Weekly on Sunday
0 4 * * 0 /home/user/aegis_sync_with_notify.sh --strava-days 90 --init-db --status-file /var/www/status/weekly.json --log-file /var/log/aegis/weekly.log

# Cleanup old logs
0 5 * * 1 find /var/log/aegis -name "*.log" -mtime +30 -delete
```

This setup provides:
- Frequent updates during active hours
- Regular full synchronization
- Weekly deep sync with database maintenance
- Automatic log cleanup
- Status monitoring endpoints
- Email notifications on failure