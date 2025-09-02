import { Task, Goal } from '../types';
import { parseDurationFromText, extractTaskTitleWithoutDuration, suggestDurationForTask } from '../utils/duration-parser';
import { differenceInDays, startOfDay, endOfDay } from 'date-fns';

export class TasksModule {
  private userId: string;
  private tasks: Task[] = [];
  private goalsMap: Map<string, Goal> = new Map();

  constructor(userId: string) {
    this.userId = userId;
  }

  async addTask(input: string): Promise<string> {
    // Parse duration from input
    const durationInfo = parseDurationFromText(input);
    const title = durationInfo ? extractTaskTitleWithoutDuration(input) : input;
    const duration = durationInfo?.minutes || suggestDurationForTask(title);

    // Determine which goal this task belongs to
    const goalId = this.mapTaskToGoal(title);
    const goal = goalId ? this.goalsMap.get(goalId) : undefined;

    // Create task
    const task: Task = {
      id: this.generateId(),
      userId: this.userId,
      goalId,
      title,
      duration: duration || undefined,
      deadline: goal?.deadline,
      priority: 0, // Will be calculated
      status: 'pending',
      source: 'manual'
    };

    // Calculate priority - simplified for now
    task.priority = 50; // Default priority

    // Save task (mock for now)
    this.tasks.push(task);

    let response = `Added task: "${title}"`;
    
    if (duration) {
      response += ` (${this.formatDuration(duration)})`;
    }
    
    if (goal) {
      response += `\n📌 Linked to: ${goal.title}`;
      if (goal.deadline) {
        const daysLeft = differenceInDays(goal.deadline, new Date());
        response += ` (${daysLeft} days until deadline)`;
      }
    }

    // Suggest when to do this task
    const suggestion = await this.suggestTimeSlot(task);
    if (suggestion) {
      response += `\n💡 Suggestion: ${suggestion}`;
    }

    return response;
  }

  async completeTask(input: string): Promise<string> {
    // Find task by partial title match
    const taskToComplete = this.findTaskByTitle(input);
    
    if (!taskToComplete) {
      return "I couldn't find that task. Please be more specific or check your task list.";
    }

    // Extract actual duration if mentioned
    const actualDurationMatch = input.match(/took\s+(\d+(?:\.\d+)?)\s*h(?:ours?)?|\btook\s+(\d+)\s*m(?:ins?|inutes?)?/i);
    let actualMinutes: number | undefined;
    
    if (actualDurationMatch) {
      if (actualDurationMatch[1]) {
        actualMinutes = parseFloat(actualDurationMatch[1]) * 60;
      } else if (actualDurationMatch[2]) {
        actualMinutes = parseInt(actualDurationMatch[2]);
      }
    }

    // Update task
    taskToComplete.status = 'completed';
    taskToComplete.completedAt = new Date();
    taskToComplete.actualDuration = actualMinutes || taskToComplete.duration;

    let response = `✅ Completed: "${taskToComplete.title}"`;
    
    if (actualMinutes && taskToComplete.duration) {
      const difference = actualMinutes - taskToComplete.duration;
      if (Math.abs(difference) > 15) {
        response += `\n⏱️ Took ${this.formatDuration(actualMinutes)} (estimated ${this.formatDuration(taskToComplete.duration)})`;
        if (difference > 0) {
          response += `\n💡 Consider breaking down similar tasks in the future`;
        }
      }
    }

    // Update daily stats
    const stats = await this.updateDailyProgress();
    
    if (taskToComplete.goalId) {
      const goal = this.goalsMap.get(taskToComplete.goalId);
      if (goal) {
        response += `\n📊 ${goal.category.toUpperCase()} progress: ${stats[goal.category]}h today`;
      }
    }

    // Suggest next task
    const nextTask = await this.getNextTask();
    if (nextTask) {
      response += `\n\n${nextTask}`;
    }

    return response;
  }

  async getNextTask(): Promise<string> {
    const pendingTasks = this.tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => b.priority - a.priority);

    if (pendingTasks.length === 0) {
      return "No pending tasks. Great job! 🎉";
    }

    const top3Tasks = pendingTasks.slice(0, 3);
    let response = "Based on your goals and available time:\n\n";

    top3Tasks.forEach((task, index) => {
      const urgencyEmoji = task.priority > 80 ? '🔴' : task.priority > 60 ? '🟡' : '🟢';
      response += `${index + 1}. ${urgencyEmoji} ${task.title}`;
      
      if (task.duration) {
        response += ` (${this.formatDuration(task.duration)})`;
      }
      
      if (task.goalId) {
        const goal = this.goalsMap.get(task.goalId);
        if (goal?.deadline) {
          const daysLeft = differenceInDays(goal.deadline, new Date());
          response += `\n   - ${goal.title} deadline in ${daysLeft} days`;
        }
      }
      
      response += '\n';
    });

    const currentHour = new Date().getHours();
    if (currentHour < 12) {
      response += "\nYou're most productive on research/writing tasks in the morning.";
    } else if (currentHour > 16) {
      response += "\nConsider lighter tasks or planning for tomorrow at this time.";
    }

    return response;
  }

  async listDeadlines(): Promise<string> {
    const septemberDeadlines = Array.from(this.goalsMap.values())
      .filter(g => g.deadline && g.deadline.getMonth() === 8 && g.deadline.getFullYear() === 2025)
      .map(g => ({
        title: g.title,
        category: g.category,
        daysLeft: differenceInDays(g.deadline!, new Date()),
        tasksCount: this.tasks.filter(t => t.goalId === g.id && t.status === 'pending').length
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    if (septemberDeadlines.length === 0) {
      return "No September deadlines found.";
    }

    let response = "📅 September 2025 Deadlines:\n\n";
    
    septemberDeadlines.forEach(deadline => {
      const urgencyEmoji = deadline.daysLeft <= 7 ? '🚨' : deadline.daysLeft <= 14 ? '⚠️' : '📌';
      response += `${urgencyEmoji} ${deadline.title}\n`;
      response += `   Category: ${deadline.category.toUpperCase()}\n`;
      response += `   Days remaining: ${deadline.daysLeft}\n`;
      response += `   Pending tasks: ${deadline.tasksCount}\n\n`;
    });

    // Add recommendations
    const mostUrgent = septemberDeadlines[0];
    if (mostUrgent.daysLeft <= 14) {
      response += `\n💡 Recommendation: Focus heavily on "${mostUrgent.title}" - only ${mostUrgent.daysLeft} days left!`;
    }

    return response;
  }

  async getTaskStatus(): Promise<string> {
    const today = new Date();
    const todaysTasks = this.tasks.filter(t => {
      const taskDate = t.completedAt || t.deadline || new Date();
      return taskDate >= startOfDay(today) && taskDate <= endOfDay(today);
    });

    const completed = todaysTasks.filter(t => t.status === 'completed');
    const pending = this.tasks.filter(t => t.status === 'pending');
    
    let response = `📋 Task Status:\n`;
    response += `- Completed today: ${completed.length}\n`;
    response += `- Pending tasks: ${pending.length}\n`;
    
    // Time spent by category
    const timeByCategory = {
      phd: 0,
      work: 0,
      other: 0
    };
    
    completed.forEach(task => {
      const duration = task.actualDuration || task.duration || 0;
      const goal = task.goalId ? this.goalsMap.get(task.goalId) : undefined;
      if (goal?.category === 'phd') {
        timeByCategory.phd += duration;
      } else if (goal?.category === 'work') {
        timeByCategory.work += duration;
      } else {
        timeByCategory.other += duration;
      }
    });
    
    response += `\nTime spent today:\n`;
    response += `- PhD: ${this.formatDuration(timeByCategory.phd)}\n`;
    response += `- Work: ${this.formatDuration(timeByCategory.work)}\n`;
    if (timeByCategory.other > 0) {
      response += `- Other: ${this.formatDuration(timeByCategory.other)}\n`;
    }
    
    // Show upcoming tasks with deadlines
    const allTasks = this.tasks.filter(t => t.status === 'pending');
    const urgentTasks = allTasks
      .filter((t: Task) => t.deadline)
      .sort((a: Task, b: Task) => differenceInDays(a.deadline!, new Date()) - differenceInDays(b.deadline!, new Date()))
      .slice(0, 3);
    
    if (urgentTasks.length > 0) {
      response += `\n\n🎯 Upcoming deadlines:`;
      urgentTasks.forEach((task: Task) => {
        const daysLeft = differenceInDays(task.deadline!, new Date());
        response += `\n- ${task.title} (${daysLeft} days)`;
      });
    }
    
    return response;
  }

  async getActiveTasks(): Promise<Task[]> {
    return this.tasks.filter(t => t.status !== 'completed');
  }

  async getTodaysCompletedTasks(): Promise<any[]> {
    const today = new Date();
    return this.tasks.filter(t => 
      t.status === 'completed' && 
      t.completedAt &&
      t.completedAt >= startOfDay(today) && 
      t.completedAt <= endOfDay(today)
    ).map(t => ({
      ...t,
      category: t.goalId ? this.goalsMap.get(t.goalId)?.category : 'other',
      duration: t.actualDuration || t.duration || 0
    }));
  }


  private mapTaskToGoal(taskTitle: string): string | undefined {
    const lower = taskTitle.toLowerCase();
    
    // PhD keywords
    if (lower.includes('vsf') || lower.includes('paper') || lower.includes('research')) {
      return '1'; // VSF Med Paper
    }
    if (lower.includes('attention') || lower.includes('visualization')) {
      return '2'; // Attention Map
    }
    if (lower.includes('dissertation') || lower.includes('proposal')) {
      return '3'; // Dissertation
    }
    
    // Work keywords
    if (lower.includes('llm') || lower.includes('nslc') || lower.includes('prediction')) {
      return '4'; // LLM NSLC
    }
    if (lower.includes('granta') || lower.includes('deployment')) {
      return '5'; // Granta
    }
    
    return undefined;
  }

  private findTaskByTitle(input: string): Task | undefined {
    const lower = input.toLowerCase();
    return this.tasks.find(t => 
      t.title.toLowerCase().includes(lower) || 
      lower.includes(t.title.toLowerCase())
    );
  }

  private async suggestTimeSlot(task: Task): Promise<string | null> {
    if (!task.duration) return null;
    
    const currentHour = new Date().getHours();
    
    if (this.isHighCognitiveTask(task) && currentHour >= 14) {
      return "Best done in the morning when you're fresh";
    }
    
    if (task.duration >= 120 && currentHour >= 15) {
      return "This needs a solid block - schedule for tomorrow morning";
    }
    
    if (task.duration <= 30) {
      return "Quick task - fit it between other activities";
    }
    
    return null;
  }

  private isHighCognitiveTask(task: Task): boolean {
    const keywords = ['write', 'research', 'analyze', 'design', 'review', 'paper'];
    return keywords.some(kw => task.title.toLowerCase().includes(kw));
  }

  private async updateDailyProgress(): Promise<Record<string, number>> {
    const todaysTasks = await this.getTodaysCompletedTasks();
    
    const stats = {
      phd: 0,
      work: 0,
      other: 0
    };
    
    todaysTasks.forEach(t => {
      const category = (t as any).category || 'other';
      stats[category as keyof typeof stats] += ((t as any).duration || 0) / 60; // Convert to hours
    });
    
    return stats;
  }

  private formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  setGoalsMap(goalsMap: Map<string, Goal>): void {
    this.goalsMap = goalsMap;
  }
}