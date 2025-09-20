#!/bin/bash
#
# Aegis Sync Cron Wrapper Script
# This script sets up the environment for cron execution
#

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    export $(grep -v '^#' "$PROJECT_DIR/.env" | xargs)
else
    echo "Error: .env file not found at $PROJECT_DIR/.env"
    exit 1
fi

# Activate virtual environment if it exists
if [ -d "$PROJECT_DIR/.venv" ]; then
    source "$PROJECT_DIR/.venv/bin/activate"
elif [ -d "$PROJECT_DIR/venv" ]; then
    source "$PROJECT_DIR/venv/bin/activate"
else
    echo "Warning: Virtual environment not found, using system Python"
fi

# Change to project directory
cd "$PROJECT_DIR"

# Create log directory if it doesn't exist
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

# Set default log file if not specified
if [[ ! " $@ " =~ " --log-file " ]]; then
    LOG_FILE="$LOG_DIR/sync_$(date +%Y%m%d).log"
    set -- "$@" --log-file "$LOG_FILE"
fi

# Run the sync script with all arguments
echo "=== Starting Aegis sync at $(date) ===" >> "${LOG_FILE:-$LOG_DIR/sync.log}"
python "$PROJECT_DIR/sync_all.py" "$@"
EXIT_CODE=$?

# Log completion
echo "=== Aegis sync completed at $(date) with exit code $EXIT_CODE ===" >> "${LOG_FILE:-$LOG_DIR/sync.log}"

exit $EXIT_CODE