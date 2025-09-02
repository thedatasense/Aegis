export interface User {
  id: string;
  name: string;
  email: string;
  timezone: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  dailyCalorieLimit: number;
  defaultRunDistance: number;
  preferredRunTime?: string;
  workHoursStart?: string;
  workHoursEnd?: string;
}

export interface Goal {
  id: string;
  userId: string;
  category: 'phd' | 'work' | 'health';
  title: string;
  description?: string;
  deadline?: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  goalId?: string;
  title: string;
  description?: string;
  duration?: number; // in minutes
  deadline?: Date;
  priority: number; // calculated priority score
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: Date;
  actualDuration?: number; // actual time spent in minutes
  source: 'ticktick' | 'manual';
  externalId?: string; // ID from external service
}

export interface NutritionLog {
  id: string;
  userId: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  description: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  loggedAt: Date;
}

export interface FastingSession {
  id: string;
  userId: string;
  startedAt: Date;
  endedAt?: Date;
  durationHours?: number;
}

export interface Activity {
  id: string;
  userId: string;
  type: 'run' | 'walk' | 'bike' | 'other';
  distance?: number; // in miles
  duration: number; // in minutes
  calories?: number;
  source: 'strava' | 'manual';
  externalId?: string;
  performedAt: Date;
}

export interface ConversationState {
  userId: string;
  context: any;
  lastInteraction: Date;
  currentFastingSession?: FastingSession;
  dailyStats?: DailyStats;
}

export interface DailyStats {
  date: Date;
  caloriesConsumed: number;
  caloriesRemaining: number;
  tasksCompleted: number;
  phdMinutes: number;
  workMinutes: number;
  exerciseMinutes: number;
  runCompleted: boolean;
}