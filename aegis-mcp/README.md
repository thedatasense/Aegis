# Aegis MCP Server

Your personal assistant MCP server for fitness and productivity. If you’re in the same boat as me:

- You use TickTick for tasks.
- You use Strava for running/workouts.
- You track weight, calories, and protein in a free Neon Postgres database.

Aegis MCP connects these dots so Claude can query, analyze, and update your data with natural instructions.

## What It Does

- TickTick: read tasks and create new ones (title, due dates, reminders, tags, priority).
- Strava: query activities with helpful unit conversions (miles/km, pace/speed).
- Daily metrics: log calories/protein/weight and analyze trends over any period.

## Tools

- get_strava_activities: Filter by type, date range, limit.
- get_ticktick_tasks: Filter by project, status, and date range.
- create_ticktick_task: Create a new TickTick task (title required; optional metadata).
- get_daily_metrics: Fetch metrics for a date range.
- update_daily_metrics: Upsert metrics for a specific day.
- analyze_fitness_trends: Summaries and insights across period.
- get_task_productivity_stats: Completion rate and average time-to-complete.

## Prerequisites

- Node.js 18+
- A Postgres database (Neon free tier works great)
- TickTick Developer app (Client ID/Secret) and OAuth tokens

## Setup

1) Install dependencies
```
cd aegis-mcp
npm install
```

2) Environment (parent folder `.env`)
```
DATABASE_URL=postgres://user:password@host:port/db
TICKTICK_CLIENT_ID=your_ticktick_client_id
TICKTICK_CLIENT_SECRET=your_ticktick_client_secret
# Optional: fallback tokens if DB doesn’t have them yet
# TICKTICK_REFRESH_TOKEN=...
# TICKTICK_ACCESS_TOKEN=...
```

3) Initialize the database schema

- If you run the main Aegis Python app, it will create tables automatically.
- Or run the SQL in `sql/schema.sql` against your database (tables: `strava_activities`, `ticktick_tasks`, `daily_metrics`, and `oauth_tokens`).

4) Hook into Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```
{
  "mcpServers": {
    "aegis": {
      "command": "node",
      "args": ["/absolute/path/to/aegis-mcp/server.js"]
    }
  }
}
```
Restart Claude Desktop.

## Usage Ideas

- “Show my runs from last week over 5km.”
- “Create a TickTick task ‘Long run 12 miles’ due Saturday 7am with a reminder.”
- “Update today’s metrics: 2400 calories in, 170g protein, 74.6kg.”
- “What’s my average calorie deficit this month?”
- “List incomplete tasks in my Work project due this week.”
- “What’s my task completion rate in the last 14 days?”

## TickTick Auth Flow

- Tokens are stored in the `oauth_tokens` table with provider `ticktick`.
- If an access token is expired, the server refreshes it using your Client ID/Secret and saves it back to Postgres.
- If no stored tokens exist, the server uses `TICKTICK_ACCESS_TOKEN`/`TICKTICK_REFRESH_TOKEN` from `.env` as a fallback.

## Development

- Start: `npm start`
- Test: `npm test` (uses Node’s built-in test runner)

## Troubleshooting

- “No valid TickTick token available”: ensure `.env` has Client ID/Secret and a refresh token, or use the Aegis UI to authorize TickTick.
- DB connection errors: verify `DATABASE_URL` and that the schema exists.
- MCP not detected: check Claude config path and restart Claude Desktop.
