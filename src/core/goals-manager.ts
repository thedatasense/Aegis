import { Goal } from '../types';
import { differenceInDays } from 'date-fns';
import { NeonService } from '../services/neon';

interface CriticalDeadline {
  title: string;
  daysLeft: number;
  category: string;
  deadline: Date;
}

export class GoalsManager {
  private userId: string;
  private neon: NeonService;
  private goals: Goal[] = [];
  private septemberDeadlines: Goal[] = [];

  constructor(userId: string, neonService: NeonService) {
    this.userId = userId;
    this.neon = neonService;
  }

  async loadGoals(): Promise<void> {
    // Load goals from database
    const dbGoals = await this.neon.getHighLevelGoals(this.userId);
    
    // Convert database goals to our Goal type
    this.goals = dbGoals.map(dbGoal => ({
      id: dbGoal.id,
      userId: dbGoal.user_id,
      category: dbGoal.category as 'phd' | 'work' | 'health',
      title: dbGoal.goal_name,
      description: dbGoal.description,
      deadline: dbGoal.deadline ? new Date(dbGoal.deadline) : undefined,
      priority: this.mapPriority(dbGoal.priority),
      status: dbGoal.status === 'active' ? 'active' : dbGoal.status === 'completed' ? 'completed' : 'paused',
      createdAt: new Date(dbGoal.created_at),
      updatedAt: new Date(dbGoal.created_at)
    }));

    this.septemberDeadlines = this.goals.filter(
      g => g.deadline && g.deadline.getMonth() === 8 && g.deadline.getFullYear() === 2025
    );
  }

  private mapPriority(dbPriority: number): 'critical' | 'high' | 'medium' | 'low' {
    if (dbPriority >= 90) return 'critical';
    if (dbPriority >= 70) return 'high';
    if (dbPriority >= 40) return 'medium';
    return 'low';
  }

  async getCriticalDeadlines(): Promise<CriticalDeadline[]> {
    const now = new Date();
    return this.septemberDeadlines
      .map(goal => ({
        title: goal.title,
        daysLeft: differenceInDays(goal.deadline!, now),
        category: goal.category,
        deadline: goal.deadline!
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async getGoalsByCategory(category: 'phd' | 'work' | 'health'): Promise<Goal[]> {
    return this.goals.filter(g => g.category === category && g.status === 'active');
  }

  async getGoalById(goalId: string): Promise<Goal | undefined> {
    return this.goals.find(g => g.id === goalId);
  }

  calculateUrgencyScore(goal: Goal): number {
    if (!goal.deadline) return 0;
    
    const daysLeft = differenceInDays(goal.deadline, new Date());
    
    // September deadlines get highest urgency
    if (goal.deadline.getMonth() === 8 && goal.deadline.getFullYear() === 2025) {
      if (daysLeft <= 7) return 100;
      if (daysLeft <= 14) return 90;
      if (daysLeft <= 30) return 80;
    }
    
    // General urgency calculation
    if (daysLeft <= 3) return 95;
    if (daysLeft <= 7) return 85;
    if (daysLeft <= 14) return 70;
    if (daysLeft <= 30) return 50;
    
    return 30;
  }

  async getTimeAllocationSuggestion(): Promise<{
    phdHours: number;
    workHours: number;
    exerciseMinutes: number;
    bufferMinutes: number;
  }> {
    const criticalDeadlines = await this.getCriticalDeadlines();
    const totalAvailableHours = 8; // Assuming 8 productive hours per day
    
    // Calculate urgency-based allocation
    const phdDeadlines = criticalDeadlines.filter(d => d.category === 'phd');
    const workDeadlines = criticalDeadlines.filter(d => d.category === 'work');
    
    const avgPhdDaysLeft = phdDeadlines.reduce((sum, d) => sum + d.daysLeft, 0) / phdDeadlines.length || 30;
    const avgWorkDaysLeft = workDeadlines.reduce((sum, d) => sum + d.daysLeft, 0) / workDeadlines.length || 30;
    
    // More time to category with closer deadlines
    const phdUrgency = 30 / avgPhdDaysLeft;
    const workUrgency = 30 / avgWorkDaysLeft;
    const totalUrgency = phdUrgency + workUrgency;
    
    const phdRatio = phdUrgency / totalUrgency;
    const workRatio = workUrgency / totalUrgency;
    
    return {
      phdHours: totalAvailableHours * phdRatio * 0.85, // 85% of calculated time
      workHours: totalAvailableHours * workRatio * 0.85,
      exerciseMinutes: 45, // Fixed for 3-mile run
      bufferMinutes: totalAvailableHours * 60 * 0.15 // 15% buffer
    };
  }

  async updateGoalProgress(goalId: string, progressValue: number, notes?: string): Promise<void> {
    await this.neon.updateGoalProgress(goalId, progressValue, notes);
    
    // Update local cache
    const goalIndex = this.goals.findIndex(g => g.id === goalId);
    if (goalIndex !== -1) {
      this.goals[goalIndex].updatedAt = new Date();
    }
  }
}