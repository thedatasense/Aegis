import { neon } from '@neondatabase/serverless';
import { 
  User, NutritionLog, FastingSession, 
  Activity, ConversationState 
} from '../types';
import { startOfDay, endOfDay } from 'date-fns';

export class NeonService {
  private sql: any;
  
  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  // User operations
  async getUser(userId: string): Promise<User | null> {
    const result = await this.sql`
      SELECT * FROM users WHERE id = ${userId}
    `;
    return result[0] || null;
  }

  async createUser(user: Partial<User>): Promise<User> {
    const result = await this.sql`
      INSERT INTO users (id, name)
      VALUES (gen_random_uuid(), ${user.name})
      RETURNING *
    `;
    return result[0];
  }

  // High-level goals operations
  async getHighLevelGoals(userId: string, category?: string): Promise<any[]> {
    if (category) {
      return await this.sql`
        SELECT * FROM high_level_goals 
        WHERE user_id = ${userId} AND category = ${category}
        ORDER BY priority DESC, deadline ASC
      `;
    }
    return await this.sql`
      SELECT * FROM high_level_goals 
      WHERE user_id = ${userId}
      ORDER BY priority DESC, deadline ASC
    `;
  }

  async createHighLevelGoal(goal: any): Promise<any> {
    const result = await this.sql`
      INSERT INTO high_level_goals (
        user_id, category, goal_name, description, 
        deadline, status, priority
      )
      VALUES (
        ${goal.userId}, ${goal.category}, ${goal.goalName}, 
        ${goal.description}, ${goal.deadline}, ${goal.status}, 
        ${goal.priority}
      )
      RETURNING *
    `;
    return result[0];
  }

  async updateGoalProgress(goalId: string, progressValue: number, notes?: string): Promise<void> {
    await this.sql`
      INSERT INTO goal_progress (goal_id, date, progress_value, notes)
      VALUES (${goalId}, CURRENT_DATE, ${progressValue}, ${notes})
    `;
  }

  // Nutrition operations
  async logNutrition(log: NutritionLog): Promise<NutritionLog> {
    const result = await this.sql`
      INSERT INTO nutrition_logs (
        id, user_id, meal_type, food_item, calories, 
        protein_g, carbs_g, fat_g, notes, logged_at
      )
      VALUES (
        gen_random_uuid(), ${log.userId}, ${log.mealType}, 
        ${log.description}, ${log.calories}, ${log.protein}, 
        ${log.carbs}, ${log.fat}, ${log.description}, NOW()
      )
      RETURNING *
    `;
    return result[0];
  }

  async getTodaysNutrition(userId: string): Promise<NutritionLog[]> {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);
    
    return await this.sql`
      SELECT * FROM nutrition_logs 
      WHERE user_id = ${userId} 
        AND logged_at >= ${start} 
        AND logged_at <= ${end}
      ORDER BY logged_at ASC
    `;
  }

  async getDailyNutritionSummary(userId: string, date: Date): Promise<any> {
    const result = await this.sql`
      SELECT 
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(protein_g), 0) as total_protein,
        COALESCE(SUM(carbs_g), 0) as total_carbs,
        COALESCE(SUM(fat_g), 0) as total_fat,
        COUNT(*) as meal_count
      FROM nutrition_logs 
      WHERE user_id = ${userId} 
        AND DATE(logged_at) = DATE(${date})
    `;
    return result[0];
  }

  // Fasting operations
  async startFastingSession(userId: string): Promise<FastingSession> {
    const result = await this.sql`
      INSERT INTO fasting_sessions (id, user_id, started_at)
      VALUES (gen_random_uuid(), ${userId}, NOW())
      RETURNING *
    `;
    return result[0];
  }

  async endFastingSession(sessionId: string): Promise<FastingSession> {
    const result = await this.sql`
      UPDATE fasting_sessions 
      SET ended_at = NOW(),
          duration_hours = EXTRACT(EPOCH FROM (NOW() - started_at)) / 3600
      WHERE id = ${sessionId}
      RETURNING *
    `;
    return result[0];
  }

  async getActiveFastingSession(userId: string): Promise<FastingSession | null> {
    const result = await this.sql`
      SELECT * FROM fasting_sessions 
      WHERE user_id = ${userId} AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `;
    return result[0] || null;
  }

  async getRecentFastingSessions(userId: string, limit: number = 10): Promise<FastingSession[]> {
    return await this.sql`
      SELECT * FROM fasting_sessions 
      WHERE user_id = ${userId}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `;
  }

  // Task operations
  async createTaskDetail(task: any): Promise<any> {
    const result = await this.sql`
      INSERT INTO task_details (
        ticktick_id, goal_id, estimated_duration_minutes, 
        priority_score, deadline
      )
      VALUES (
        ${task.ticktickId}, ${task.goalId}, 
        ${task.estimatedDuration}, ${task.priorityScore}, 
        ${task.deadline}
      )
      RETURNING *
    `;
    return result[0];
  }

  async getTasksByGoal(goalId: string): Promise<any[]> {
    return await this.sql`
      SELECT td.*, tc.completed_at, tc.time_spent_minutes
      FROM task_details td
      LEFT JOIN task_completions tc ON td.ticktick_id = tc.ticktick_id
      WHERE td.goal_id = ${goalId}
      ORDER BY td.priority_score DESC
    `;
  }

  async logTaskCompletion(completion: any): Promise<any> {
    const result = await this.sql`
      INSERT INTO task_completions (
        id, user_id, ticktick_id, category, 
        completed_at, time_spent_minutes
      )
      VALUES (
        gen_random_uuid(), ${completion.userId}, ${completion.ticktickId}, 
        ${completion.category}, NOW(), ${completion.timeSpent}
      )
      RETURNING *
    `;
    return result[0];
  }

  async getTodaysCompletedTasks(userId: string): Promise<any[]> {
    const today = new Date();
    return await this.sql`
      SELECT tc.*, td.goal_id, hlg.category as goal_category
      FROM task_completions tc
      LEFT JOIN task_details td ON tc.ticktick_id = td.ticktick_id
      LEFT JOIN high_level_goals hlg ON td.goal_id = hlg.id
      WHERE tc.user_id = ${userId} 
        AND DATE(tc.completed_at) = DATE(${today})
      ORDER BY tc.completed_at DESC
    `;
  }

  // Activity operations
  async logActivity(activity: Activity): Promise<Activity> {
    const result = await this.sql`
      INSERT INTO activities (
        id, user_id, strava_id, activity_type, 
        distance_km, duration_minutes, calories_burned, logged_at
      )
      VALUES (
        gen_random_uuid(), ${activity.userId}, ${activity.externalId}, 
        ${activity.type}, ${activity.distance ? activity.distance * 1.60934 : null}, 
        ${activity.duration}, ${activity.calories}, ${activity.performedAt}
      )
      ON CONFLICT (strava_id) DO UPDATE
      SET distance_km = EXCLUDED.distance_km,
          duration_minutes = EXCLUDED.duration_minutes,
          calories_burned = EXCLUDED.calories_burned
      RETURNING *
    `;
    return result[0];
  }

  async getTodaysActivities(userId: string): Promise<Activity[]> {
    const today = new Date();
    const results = await this.sql`
      SELECT *, distance_km / 1.60934 as distance_miles
      FROM activities 
      WHERE user_id = ${userId} 
        AND DATE(logged_at) = DATE(${today})
      ORDER BY logged_at DESC
    `;
    
    return results.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      type: r.activity_type,
      distance: r.distance_miles,
      duration: r.duration_minutes,
      calories: r.calories_burned,
      source: r.strava_id ? 'strava' : 'manual',
      externalId: r.strava_id,
      performedAt: r.logged_at
    }));
  }

  async getWeeklyActivities(userId: string): Promise<Activity[]> {
    const results = await this.sql`
      SELECT *, distance_km / 1.60934 as distance_miles
      FROM activities 
      WHERE user_id = ${userId} 
        AND logged_at >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY logged_at DESC
    `;
    
    return results.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      type: r.activity_type,
      distance: r.distance_miles,
      duration: r.duration_minutes,
      calories: r.calories_burned,
      source: r.strava_id ? 'strava' : 'manual',
      externalId: r.strava_id,
      performedAt: r.logged_at
    }));
  }

  // Conversation state operations
  async saveConversationState(state: ConversationState): Promise<void> {
    // First check if a state exists for this user
    const existing = await this.sql`
      SELECT id FROM conversation_state WHERE user_id = ${state.userId}
    `;
    
    if (existing.length > 0) {
      // Update existing state
      await this.sql`
        UPDATE conversation_state 
        SET state_json = ${JSON.stringify(state)},
            updated_at = NOW()
        WHERE user_id = ${state.userId}
      `;
    } else {
      // Insert new state
      await this.sql`
        INSERT INTO conversation_state (id, user_id, state_json, updated_at)
        VALUES (gen_random_uuid(), ${state.userId}, ${JSON.stringify(state)}, NOW())
      `;
    }
  }

  async getConversationState(userId: string): Promise<ConversationState | null> {
    const result = await this.sql`
      SELECT state_json FROM conversation_state 
      WHERE user_id = ${userId}
    `;
    return result[0]?.state_json || null;
  }

  // Daily plan operations
  async saveDailyPlan(plan: any): Promise<any> {
    // Check if a plan exists for this user and date
    const existing = await this.sql`
      SELECT id FROM daily_plans 
      WHERE user_id = ${plan.userId} AND date = DATE(${plan.date})
    `;
    
    if (existing.length > 0) {
      // Update existing plan
      const result = await this.sql`
        UPDATE daily_plans 
        SET planned_tasks = ${JSON.stringify(plan.plannedTasks)},
            time_allocated_minutes = ${plan.timeAllocated}
        WHERE user_id = ${plan.userId} AND date = DATE(${plan.date})
        RETURNING *
      `;
      return result[0];
    } else {
      // Insert new plan
      const result = await this.sql`
        INSERT INTO daily_plans (
          user_id, date, planned_tasks, time_allocated_minutes
        )
        VALUES (
          ${plan.userId}, ${plan.date}, ${JSON.stringify(plan.plannedTasks)}, 
          ${plan.timeAllocated}
        )
        RETURNING *
      `;
      return result[0];
    }
  }

  async getDailyPlan(userId: string, date: Date): Promise<any> {
    const result = await this.sql`
      SELECT * FROM daily_plans 
      WHERE user_id = ${userId} AND date = DATE(${date})
    `;
    return result[0] || null;
  }

  // Meal templates operations
  async getMealTemplates(userId: string): Promise<any[]> {
    return await this.sql`
      SELECT * FROM meal_templates 
      WHERE user_id = ${userId}
      ORDER BY is_favorite DESC, name ASC
    `;
  }

  async createMealTemplate(template: any): Promise<any> {
    const result = await this.sql`
      INSERT INTO meal_templates (
        id, user_id, name, calories, protein_g, 
        carbs_g, fat_g, is_favorite
      )
      VALUES (
        gen_random_uuid(), ${template.userId}, ${template.name}, 
        ${template.calories}, ${template.protein}, ${template.carbs}, 
        ${template.fat}, ${template.isFavorite || false}
      )
      RETURNING *
    `;
    return result[0];
  }

  // Pattern operations
  async saveUserPattern(pattern: any): Promise<void> {
    await this.sql`
      INSERT INTO user_patterns (
        id, user_id, pattern_type, pattern_data, confidence
      )
      VALUES (
        gen_random_uuid(), ${pattern.userId}, ${pattern.type}, 
        ${JSON.stringify(pattern.data)}, ${pattern.confidence}
      )
      ON CONFLICT (user_id, pattern_type) DO UPDATE
      SET pattern_data = ${JSON.stringify(pattern.data)},
          confidence = ${pattern.confidence},
          updated_at = NOW()
    `;
  }

  async getUserPatterns(userId: string): Promise<any[]> {
    return await this.sql`
      SELECT * FROM user_patterns 
      WHERE user_id = ${userId}
      ORDER BY confidence DESC
    `;
  }

  // Analytics queries
  async getCalorieAverages(userId: string, days: number = 7): Promise<any> {
    const result = await this.sql`
      SELECT 
        AVG(daily_calories) as avg_calories,
        MIN(daily_calories) as min_calories,
        MAX(daily_calories) as max_calories,
        COUNT(*) as days_tracked
      FROM (
        SELECT DATE(logged_at) as log_date, SUM(calories) as daily_calories
        FROM nutrition_logs
        WHERE user_id = ${userId} 
          AND logged_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE(logged_at)
      ) daily_totals
    `;
    return result[0];
  }

  async getTaskCompletionStats(userId: string, days: number = 30): Promise<any> {
    const result = await this.sql`
      SELECT 
        category,
        COUNT(*) as tasks_completed,
        SUM(time_spent_minutes) as total_minutes,
        AVG(time_spent_minutes) as avg_minutes_per_task
      FROM task_completions
      WHERE user_id = ${userId} 
        AND completed_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY category
    `;
    return result;
  }
}