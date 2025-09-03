# Aegis MCP Server

An MCP (Model Context Protocol) server for Claude Desktop that provides intelligent access to your fitness and productivity data from Strava and TickTick.

## Features

The MCP server provides these tools:

1. **get_strava_activities** - Query your Strava activities with filters for type, date range, etc.
2. **get_ticktick_tasks** - Query TickTick tasks by project, status, date range
3. **get_daily_metrics** - Retrieve your daily health metrics (calories, protein, weight)
4. **update_daily_metrics** - Log or update daily health metrics
5. **analyze_fitness_trends** - Get insights on your fitness trends over time
6. **get_task_productivity_stats** - Analyze task completion rates and productivity

## Setup

1. Install dependencies:
```bash
cd aegis-mcp
npm install
```

2. Make sure your `.env` file in the parent directory contains:
```
DATABASE_URL=your_postgres_connection_string
```

3. Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "aegis": {
      "command": "node",
      "args": ["/path/to/aegis-mcp/server.js"]
    }
  }
}
```

4. Restart Claude Desktop

## Usage Examples

Once configured, you can ask Claude things like:

- "Show me my running activities from the last week"
- "What's my average calorie intake this month?"
- "Update today's metrics: 2500 calories in, 180g protein, 75kg weight"
- "Analyze my fitness trends for the past 30 days"
- "Show me incomplete tasks from my Work project"
- "What's my task completion rate this week?"

The MCP server reads from your existing database tables that are populated by the main Aegis application.