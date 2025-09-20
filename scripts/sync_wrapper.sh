#!/bin/bash

# Aegis Sync Wrapper Script for launchd
# This script sets up the environment and runs the Python sync script

# Change to the project directory
cd /Users/bineshkumar/Documents/GitHub/Aegis

# Source .env file if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Activate virtual environment if it exists
if [ -d .venv ]; then
    source .venv/bin/activate
fi

# Run the sync script with logging
python3 sync_all.py \
    --log-file /Users/bineshkumar/Documents/GitHub/Aegis/logs/sync_$(date +%Y%m%d).log \
    --status-file /Users/bineshkumar/Documents/GitHub/Aegis/logs/sync_status.json \
    --verbose

# Exit with the same code as the Python script
exit $?