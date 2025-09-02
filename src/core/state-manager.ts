import { ConversationState, DailyStats } from '../types';
import { NeonService } from '../services/neon';

export class StateManager {
  private userId: string;
  private neon: NeonService;
  private state: ConversationState;

  constructor(userId: string, neonService: NeonService) {
    this.userId = userId;
    this.neon = neonService;
    this.state = {
      userId,
      context: {},
      lastInteraction: new Date()
    };
  }

  async loadState(): Promise<ConversationState> {
    const savedState = await this.neon.getConversationState(this.userId);
    
    if (savedState) {
      this.state = savedState;
      // Update last interaction time
      this.state.lastInteraction = new Date();
    } else {
      // Initialize new state
      this.state = {
        userId: this.userId,
        context: {
          preferences: {
            dailyCalorieLimit: 1100,
            defaultRunDistance: 3,
            preferredRunTime: '16:00'
          }
        },
        lastInteraction: new Date(),
        dailyStats: await this.calculateDailyStats()
      };
      await this.saveState(this.state);
    }
    
    return this.state;
  }

  async saveState(state: ConversationState): Promise<void> {
    this.state = state;
    this.state.lastInteraction = new Date();
    await this.neon.saveConversationState(this.state);
  }

  async updateContext(key: string, value: any): Promise<void> {
    this.state.context[key] = value;
    await this.saveState(this.state);
  }

  async updateDailyStats(stats: DailyStats): Promise<void> {
    this.state.dailyStats = stats;
    await this.saveState(this.state);
  }

  private async calculateDailyStats(): Promise<DailyStats> {
    const [nutrition, tasks, activities] = await Promise.all([
      this.neon.getTodaysNutrition(this.userId),
      this.neon.getTodaysCompletedTasks(this.userId),
      this.neon.getTodaysActivities(this.userId)
    ]);

    const caloriesConsumed = nutrition.reduce((sum, log) => sum + log.calories, 0);
    const tasksCompleted = tasks.length;
    
    const phdMinutes = tasks
      .filter(t => t.goal_category === 'phd')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);
    
    const workMinutes = tasks
      .filter(t => t.goal_category === 'work')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);
    
    const exerciseMinutes = activities
      .reduce((sum, a) => sum + a.duration, 0);
    
    const runCompleted = activities
      .some(a => a.type === 'run' && a.distance && a.distance >= 3);

    return {
      date: new Date(),
      caloriesConsumed,
      caloriesRemaining: 1100 - caloriesConsumed,
      tasksCompleted,
      phdMinutes,
      workMinutes,
      exerciseMinutes,
      runCompleted
    };
  }

  getState(): ConversationState {
    return this.state;
  }

  getContext(key: string): any {
    return this.state.context[key];
  }
}