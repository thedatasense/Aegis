import { User, ConversationState } from '../types';
import { StateManager } from './state-manager';
import { GoalsManager } from './goals-manager';
import { IntentClassifier } from './intent-classifier';
import { NutritionModule } from '../modules/nutrition';
import { TasksModule } from '../modules/tasks';
import { HealthModule } from '../modules/health';
import { PlanningModule } from '../modules/planning';
import { NeonService } from '../services/neon';

export class Aegis {
  private userId: string;
  private user!: User;
  private neon: NeonService;
  private stateManager: StateManager;
  private goalsManager: GoalsManager;
  private intentClassifier: IntentClassifier;
  private nutritionModule: NutritionModule;
  private tasksModule: TasksModule;
  private healthModule: HealthModule;
  private planningModule: PlanningModule;
  private conversationState!: ConversationState;

  constructor(userId: string, databaseUrl: string) {
    this.userId = userId;
    this.neon = new NeonService(databaseUrl);
    this.stateManager = new StateManager(userId, this.neon);
    this.goalsManager = new GoalsManager(userId, this.neon);
    this.intentClassifier = new IntentClassifier();
    this.nutritionModule = new NutritionModule(userId, this.neon);
    this.tasksModule = new TasksModule(userId);
    this.healthModule = new HealthModule(userId, this.neon);
    this.planningModule = new PlanningModule(userId, this.neon);
  }

  private async initializeUser(): Promise<void> {
    // Load user from database
    const dbUser = await this.neon.getUser(this.userId);
    if (!dbUser) {
      throw new Error(`User ${this.userId} not found`);
    }
    
    // Get preferences from conversation state
    const state = await this.stateManager.loadState();
    const preferences = state.context.preferences || {
      dailyCalorieLimit: 1100,
      defaultRunDistance: 3,
      preferredRunTime: '16:00',
      workHoursStart: '09:00',
      workHoursEnd: '17:00'
    };
    
    this.user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email || 'user@example.com',
      timezone: 'America/New_York',
      preferences
    };
  }

  async initialize(): Promise<void> {
    await this.initializeUser();
    this.conversationState = await this.stateManager.loadState();
    await this.goalsManager.loadGoals();
    await this.updateDailyStats();
  }

  async processCommand(input: string): Promise<string> {
    const intent = await this.intentClassifier.classify(input);
    
    switch (intent.category) {
      case 'nutrition':
        return await this.handleNutritionCommand(intent, input);
      case 'task':
        return await this.handleTaskCommand(intent, input);
      case 'health':
        return await this.handleHealthCommand(intent, input);
      case 'planning':
        return await this.handlePlanningCommand(intent, input);
      case 'greeting':
        return await this.handleGreeting();
      case 'status':
        return await this.handleStatusRequest(intent);
      default:
        return "I didn't understand that. Can you rephrase?";
    }
  }

  private async handleNutritionCommand(intent: any, input: string): Promise<string> {
    switch (intent.action) {
      case 'log_meal':
        return await this.nutritionModule.logMeal(input);
      case 'start_fast':
        return await this.nutritionModule.startFasting();
      case 'end_fast':
        return await this.nutritionModule.endFasting();
      case 'check_calories':
        return await this.nutritionModule.getCalorieStatus();
      default:
        return "I couldn't process that nutrition command.";
    }
  }

  private async handleTaskCommand(intent: any, input: string): Promise<string> {
    switch (intent.action) {
      case 'add_task':
        return await this.tasksModule.addTask(input);
      case 'complete_task':
        return await this.tasksModule.completeTask(input);
      case 'next_task':
        return await this.tasksModule.getNextTask();
      case 'list_deadlines':
        return await this.tasksModule.listDeadlines();
      default:
        return "I couldn't process that task command.";
    }
  }

  private async handleHealthCommand(intent: any, input: string): Promise<string> {
    switch (intent.action) {
      case 'log_run':
        return await this.healthModule.logRun(input);
      case 'check_run':
        return await this.healthModule.checkDailyRun();
      case 'weekly_stats':
        return await this.healthModule.getWeeklyStats();
      default:
        return "I couldn't process that health command.";
    }
  }

  private async handlePlanningCommand(intent: any, input: string): Promise<string> {
    switch (intent.action) {
      case 'plan_day':
        return await this.planningModule.planDay();
      case 'time_allocation':
        return await this.planningModule.suggestTimeAllocation(input);
      default:
        return "I couldn't process that planning command.";
    }
  }

  private async handleGreeting(): Promise<string> {
    const stats = this.conversationState.dailyStats!;
    const criticalDeadlines = await this.goalsManager.getCriticalDeadlines();
    const fastingStatus = await this.nutritionModule.getFastingStatus();
    
    let response = `Good ${this.getTimeOfDay()}! Here's your status:\n`;
    
    if (fastingStatus.isFasting) {
      response += `- Fasting for ${fastingStatus.hours} hours (great job!)\n`;
    }
    
    if (criticalDeadlines.length > 0) {
      response += `- Critical September deadlines:\n`;
      criticalDeadlines.forEach(deadline => {
        response += `  • ${deadline.title}: ${deadline.daysLeft} days left\n`;
      });
    }
    
    const todaysPlan = await this.planningModule.getTodaysFocus();
    response += `- Today's focus: ${todaysPlan}\n`;
    
    if (!stats.runCompleted) {
      response += `- Weather is perfect for your 3-mile run at ${this.user.preferences.preferredRunTime}\n`;
    }
    
    response += `- Calorie budget: ${stats.caloriesRemaining} remaining of ${this.user.preferences.dailyCalorieLimit}\n`;
    response += `\nWhat would you like to tackle first?`;
    
    return response;
  }

  private async handleStatusRequest(intent: any): Promise<string> {
    switch (intent.subtype) {
      case 'calories':
        return await this.nutritionModule.getCalorieStatus();
      case 'tasks':
        return await this.tasksModule.getTaskStatus();
      case 'general':
        return await this.getGeneralStatus();
      default:
        return await this.getGeneralStatus();
    }
  }

  private async getGeneralStatus(): Promise<string> {
    const stats = this.conversationState.dailyStats!;
    const activeTasks = await this.tasksModule.getActiveTasks();
    
    return `Today's Progress:
- Calories: ${stats.caloriesConsumed}/${this.user.preferences.dailyCalorieLimit} (${stats.caloriesRemaining} remaining)
- Tasks completed: ${stats.tasksCompleted}
- PhD time: ${Math.round(stats.phdMinutes / 60)} hours
- Work time: ${Math.round(stats.workMinutes / 60)} hours
- Active tasks: ${activeTasks.length}
- Run: ${stats.runCompleted ? '✓ Completed' : '⏳ Pending'}`;
  }

  private async updateDailyStats(): Promise<void> {
    const today = new Date();
    const calories = await this.nutritionModule.getTodaysCalories();
    const tasks = await this.neon.getTodaysCompletedTasks(this.userId);
    const activities = await this.healthModule.getTodaysActivities();
    
    this.conversationState.dailyStats = {
      date: today,
      caloriesConsumed: calories.consumed,
      caloriesRemaining: this.user.preferences.dailyCalorieLimit - calories.consumed,
      tasksCompleted: tasks.length,
      phdMinutes: tasks.filter(t => t.goal_category === 'phd').reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0),
      workMinutes: tasks.filter(t => t.goal_category === 'work').reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0),
      exerciseMinutes: activities.reduce((sum, a) => sum + a.duration, 0),
      runCompleted: activities.some(a => a.type === 'run' && a.distance && a.distance >= 3)
    };
    
    await this.stateManager.updateDailyStats(this.conversationState.dailyStats!);
  }

  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }
}