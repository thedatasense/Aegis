#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';
import { createTickTickTask, getTickTickHeaders, TICKTICK_BASE } from './ticktick.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(dirname(__dirname), '.env') });

// Database connection pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// TickTick helpers moved to ./ticktick.js

// Conversion helpers
const metersToMiles = (meters) => (meters * 0.000621371).toFixed(2);
const metersToKm = (meters) => (meters / 1000).toFixed(2);
const mpsToMph = (mps) => (mps * 2.23694).toFixed(2);
const mpsToKph = (mps) => (mps * 3.6).toFixed(2);
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${secs}s` : `${minutes}m ${secs}s`;
};

// Create MCP server
const server = new Server(
  {
    name: 'aegis-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_strava_activities',
      description: 'Query Strava activities with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of activities to return' },
          activity_type: { type: 'string', description: 'Filter by activity type (e.g., Run, Ride, Swim)' },
          start_date: { type: 'string', description: 'Filter activities after this date (ISO format)' },
          end_date: { type: 'string', description: 'Filter activities before this date (ISO format)' }
        }
      }
    },
    {
      name: 'get_ticktick_tasks',
      description: 'Query TickTick tasks with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Filter by project ID' },
          status: { type: 'string', description: 'Filter by status (completed, pending)' },
          limit: { type: 'number', description: 'Number of tasks to return' },
          start_date: { type: 'string', description: 'Filter tasks after this date' },
          end_date: { type: 'string', description: 'Filter tasks before this date' }
        }
      }
    },
    {
      name: 'get_daily_metrics',
      description: 'Get daily health metrics for a date range',
      inputSchema: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' }
        }
      }
    },
    {
      name: 'update_daily_metrics',
      description: 'Update or insert daily health metrics',
      inputSchema: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'Date (YYYY-MM-DD)', required: true },
          calorie_in: { type: 'number', description: 'Calories consumed' },
          calorie_out: { type: 'number', description: 'Calories burned' },
          protein_g: { type: 'number', description: 'Protein intake in grams' },
          weight_kg: { type: 'number', description: 'Body weight in kg' },
          notes: { type: 'string', description: 'Notes for the day' }
        },
        required: ['day']
      }
    },
    {
      name: 'analyze_fitness_trends',
      description: 'Analyze fitness trends and provide insights',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to analyze (default: 30)' },
          metrics: {
            type: 'array',
            description: 'Specific metrics to analyze',
            items: { type: 'string' }
          }
        }
      }
    },
    {
      name: 'get_task_productivity_stats',
      description: 'Get productivity statistics from TickTick tasks',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Number of days to analyze (default: 30)' },
          project_id: { type: 'string', description: 'Filter by specific project' }
        }
      }
    },
    {
      name: 'create_ticktick_task',
      description: 'Create a new task in TickTick',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title (required)' },
          project_id: { type: 'string', description: 'Project ID to create task in' },
          content: { type: 'string', description: 'Task content/description' },
          desc: { type: 'string', description: 'Task description (alternative to content)' },
          is_all_day: { type: 'boolean', description: 'Whether task is all day' },
          start_date: { type: 'string', description: 'Task start date (ISO format)' },
          due_date: { type: 'string', description: 'Task due date (ISO format)' },
          time_zone: { type: 'string', description: 'Time zone for the task' },
          repeat_flag: { type: 'string', description: 'Repeat pattern (e.g., RRULE:FREQ=DAILY)' },
          reminders: { 
            type: 'array', 
            description: 'Array of reminder times',
            items: { type: 'string' }
          },
          priority: { type: 'number', description: 'Task priority (0=none, 1=low, 3=medium, 5=high)' },
          tags: { 
            type: 'array', 
            description: 'Task tags',
            items: { type: 'string' }
          }
        },
        required: ['title']
      }
    }
  ],
}));

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_strava_activities': {
        let query = 'SELECT * FROM strava_activities WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (args.activity_type) {
          query += ` AND type = $${++paramCount}`;
          params.push(args.activity_type);
        }
        if (args.start_date) {
          query += ` AND start_date >= $${++paramCount}`;
          params.push(args.start_date);
        }
        if (args.end_date) {
          query += ` AND start_date <= $${++paramCount}`;
          params.push(args.end_date);
        }
        
        query += ' ORDER BY start_date DESC';
        
        if (args.limit) {
          query += ` LIMIT $${++paramCount}`;
          params.push(args.limit);
        }

        const result = await pool.query(query, params);
        
        // Transform the data to include converted units
        const activities = result.rows.map(activity => ({
          ...activity,
          distance_miles: metersToMiles(activity.distance),
          distance_km: metersToKm(activity.distance),
          moving_time_formatted: formatDuration(activity.moving_time),
          average_speed_mph: mpsToMph(activity.average_speed),
          average_speed_kph: mpsToKph(activity.average_speed),
          max_speed_mph: mpsToMph(activity.max_speed),
          max_speed_kph: mpsToKph(activity.max_speed),
          elevation_gain_ft: (activity.total_elevation_gain * 3.28084).toFixed(1)
        }));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(activities, null, 2)
          }]
        };
      }

      case 'get_ticktick_tasks': {
        let query = 'SELECT * FROM ticktick_tasks WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (args.project_id) {
          query += ` AND project_id = $${++paramCount}`;
          params.push(args.project_id);
        }
        if (args.status === 'completed') {
          query += ` AND status = '2'`;
        } else if (args.status === 'pending') {
          query += ` AND status != '2'`;
        }
        if (args.start_date) {
          query += ` AND (due_date >= $${++paramCount} OR start_date >= $${paramCount})`;
          params.push(args.start_date);
        }
        if (args.end_date) {
          query += ` AND (due_date <= $${++paramCount} OR start_date <= $${paramCount})`;
          params.push(args.end_date);
        }
        
        query += ' ORDER BY due_date DESC NULLS LAST';
        
        if (args.limit) {
          query += ` LIMIT $${++paramCount}`;
          params.push(args.limit);
        }

        const result = await pool.query(query, params);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.rows, null, 2)
          }]
        };
      }

      case 'get_daily_metrics': {
        let query = 'SELECT * FROM daily_metrics WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (args.start_date) {
          query += ` AND day >= $${++paramCount}`;
          params.push(args.start_date);
        }
        if (args.end_date) {
          query += ` AND day <= $${++paramCount}`;
          params.push(args.end_date);
        }
        
        query += ' ORDER BY day DESC';

        const result = await pool.query(query, params);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result.rows, null, 2)
          }]
        };
      }

      case 'update_daily_metrics': {
        const fields = [];
        const values = [];
        let paramCount = 0;

        // Build the insert/update query
        const insertFields = ['day'];
        const insertPlaceholders = ['$1'];
        values.push(args.day);
        paramCount = 1;

        const updateFields = [];

        if (args.calorie_in !== undefined) {
          insertFields.push('calorie_in');
          insertPlaceholders.push(`$${++paramCount}`);
          values.push(args.calorie_in);
          updateFields.push(`calorie_in = $${paramCount}`);
        }
        if (args.calorie_out !== undefined) {
          insertFields.push('calorie_out');
          insertPlaceholders.push(`$${++paramCount}`);
          values.push(args.calorie_out);
          updateFields.push(`calorie_out = $${paramCount}`);
        }
        if (args.protein_g !== undefined) {
          insertFields.push('protein_g');
          insertPlaceholders.push(`$${++paramCount}`);
          values.push(args.protein_g);
          updateFields.push(`protein_g = $${paramCount}`);
        }
        if (args.weight_kg !== undefined) {
          insertFields.push('weight_kg');
          insertPlaceholders.push(`$${++paramCount}`);
          values.push(args.weight_kg);
          updateFields.push(`weight_kg = $${paramCount}`);
        }
        if (args.notes !== undefined) {
          insertFields.push('notes');
          insertPlaceholders.push(`$${++paramCount}`);
          values.push(args.notes);
          updateFields.push(`notes = $${paramCount}`);
        }

        updateFields.push('updated_at = NOW()');

        const query = `
          INSERT INTO daily_metrics (${insertFields.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
          ON CONFLICT (day) DO UPDATE SET ${updateFields.join(', ')}
          RETURNING *
        `;

        const result = await pool.query(query, values);
        return {
          content: [{
            type: 'text',
            text: `Successfully updated metrics for ${args.day}:\n${JSON.stringify(result.rows[0], null, 2)}`
          }]
        };
      }

      case 'analyze_fitness_trends': {
        const days = args.days || 30;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        // Get activities
        const activitiesQuery = `
          SELECT type, COUNT(*) as count, 
                 SUM(distance) as total_distance,
                 SUM(moving_time) as total_time,
                 AVG(average_heartrate) as avg_hr,
                 SUM(kilojoules) as total_energy
          FROM strava_activities 
          WHERE start_date >= $1 AND start_date <= $2
          GROUP BY type
        `;
        
        // Get daily metrics
        const metricsQuery = `
          SELECT AVG(calorie_in) as avg_calories_in,
                 AVG(calorie_out) as avg_calories_out,
                 AVG(protein_g) as avg_protein,
                 AVG(weight_kg) as avg_weight,
                 MIN(weight_kg) as min_weight,
                 MAX(weight_kg) as max_weight
          FROM daily_metrics
          WHERE day >= $1 AND day <= $2
        `;

        const [activities, metrics] = await Promise.all([
          pool.query(activitiesQuery, [startDate.toISOString(), endDate.toISOString()]),
          pool.query(metricsQuery, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]])
        ]);

        const analysis = {
          period: `${days} days (${startDate.toDateString()} - ${endDate.toDateString()})`,
          activities: activities.rows,
          nutrition_metrics: metrics.rows[0],
          insights: []
        };

        // Generate insights
        if (metrics.rows[0].avg_weight && metrics.rows[0].min_weight && metrics.rows[0].max_weight) {
          const weightChange = metrics.rows[0].max_weight - metrics.rows[0].min_weight;
          analysis.insights.push(`Weight variation: ${weightChange.toFixed(1)} kg`);
        }

        if (metrics.rows[0].avg_calories_in && metrics.rows[0].avg_calories_out) {
          const deficit = metrics.rows[0].avg_calories_out - metrics.rows[0].avg_calories_in;
          analysis.insights.push(`Average daily calorie ${deficit > 0 ? 'deficit' : 'surplus'}: ${Math.abs(deficit).toFixed(0)} calories`);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(analysis, null, 2)
          }]
        };
      }

      case 'get_task_productivity_stats': {
        const days = args.days || 30;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);

        let query = `
          SELECT 
            COUNT(CASE WHEN status = '2' THEN 1 END) as completed_tasks,
            COUNT(CASE WHEN status != '2' THEN 1 END) as pending_tasks,
            COUNT(*) as total_tasks,
            COUNT(DISTINCT project_id) as projects_involved,
            AVG(CASE WHEN status = '2' AND completed_time IS NOT NULL 
                THEN EXTRACT(EPOCH FROM (completed_time - created_time))/86400 
                END) as avg_completion_days
          FROM ticktick_tasks
          WHERE created_time >= $1 AND created_time <= $2
        `;
        const params = [startDate.toISOString(), endDate.toISOString()];

        if (args.project_id) {
          query += ' AND project_id = $3';
          params.push(args.project_id);
        }

        const result = await pool.query(query, params);
        const stats = result.rows[0];
        
        stats.completion_rate = stats.total_tasks > 0 
          ? ((stats.completed_tasks / stats.total_tasks) * 100).toFixed(1) + '%'
          : '0%';
        stats.period = `${days} days`;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(stats, null, 2)
          }]
        };
      }

      case 'create_ticktick_task': {
        const { createdTask } = await createTickTickTask(pool, args, fetch);
        return {
          content: [{
            type: 'text',
            text: `Successfully created TickTick task:\n${JSON.stringify({
              id: createdTask.id,
              title: createdTask.title,
              project_id: createdTask.projectId,
              due_date: createdTask.dueDate,
              priority: createdTask.priority,
              tags: createdTask.tags,
              created_time: createdTask.createdTime
            }, null, 2)}`
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }]
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Aegis MCP server running...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
