import { NeonService } from '../services/neon';
import { calculateTimeAllocation, getCurrentTimeSlot } from '../utils/priority-calc';
import { formatDuration } from '../utils/duration-parser';
import { differenceInDays } from 'date-fns';

export class PlanningModule {
  private userId: string;
  private neon: NeonService;

  constructor(userId: string, neonService: NeonService) {
    this.userId = userId;
    this.neon = neonService;
  }

  async planDay(): Promise<string> {
    // Get all relevant data
    const [goals, , completedTasks, todaysActivities] = await Promise.all([
      this.neon.getHighLevelGoals(this.userId),
      this.neon.getDailyPlan(this.userId, new Date()),
      this.neon.getTodaysCompletedTasks(this.userId),
      this.neon.getTodaysActivities(this.userId)
    ]);

    // Get September deadlines
    const septemberGoals = goals.filter(g => 
      g.deadline && 
      new Date(g.deadline).getMonth() === 8 && 
      new Date(g.deadline).getFullYear() === 2025
    );

    // Calculate urgency
    const phdDeadlines = septemberGoals
      .filter(g => g.category === 'phd')
      .map(g => differenceInDays(new Date(g.deadline), new Date()));
    
    const workDeadlines = septemberGoals
      .filter(g => g.category === 'work')
      .map(g => differenceInDays(new Date(g.deadline), new Date()));

    // Get time allocation
    const timeSlot = getCurrentTimeSlot();
    const remainingHours = timeSlot.availableMinutes / 60;
    const allocation = calculateTimeAllocation(phdDeadlines, workDeadlines, remainingHours);

    // Check what's already done today
    const phdMinutesCompleted = completedTasks
      .filter(t => t.goal_category === 'phd')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);
    
    const workMinutesCompleted = completedTasks
      .filter(t => t.goal_category === 'work')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);

    const hasRun = todaysActivities.some(a => a.type === 'run' && a.distance && a.distance >= 3);

    // Build response
    let response = `📅 Daily Plan (${remainingHours.toFixed(1)} hours available):\n\n`;

    // Critical deadlines reminder
    if (septemberGoals.length > 0) {
      response += `⚠️ September Deadlines:\n`;
      septemberGoals
        .sort((a, b) => differenceInDays(new Date(a.deadline), new Date()) - differenceInDays(new Date(b.deadline), new Date()))
        .slice(0, 3)
        .forEach(goal => {
          const daysLeft = differenceInDays(new Date(goal.deadline), new Date());
          response += `• ${goal.goal_name}: ${daysLeft} days\n`;
        });
      response += '\n';
    }

    // Time allocation
    response += `⏰ Recommended Time Allocation:\n`;
    
    const phdRemaining = Math.max(0, allocation.phdHours * 60 - phdMinutesCompleted);
    const workRemaining = Math.max(0, allocation.workHours * 60 - workMinutesCompleted);
    
    if (phdRemaining > 0) {
      response += `• PhD work: ${formatDuration(Math.round(phdRemaining))}`;
      if (phdMinutesCompleted > 0) {
        response += ` (${formatDuration(phdMinutesCompleted)} completed)`;
      }
      response += '\n';
    }
    
    if (workRemaining > 0) {
      response += `• Work tasks: ${formatDuration(Math.round(workRemaining))}`;
      if (workMinutesCompleted > 0) {
        response += ` (${formatDuration(workMinutesCompleted)} completed)`;
      }
      response += '\n';
    }
    
    if (!hasRun) {
      response += `• Exercise: 45m (3-mile run)\n`;
    }
    
    response += `• Buffer/breaks: ${formatDuration(Math.round(allocation.bufferMinutes))}\n`;

    // Specific recommendations based on time of day
    response += `\n💡 ${this.getTimeBasedRecommendation(timeSlot.productivity)}`;

    // Task suggestions
    const taskSuggestions = await this.getTopPriorityTasks(phdRemaining > workRemaining ? 'phd' : 'work');
    if (taskSuggestions.length > 0) {
      response += `\n\n🎯 Suggested tasks to focus on:\n`;
      taskSuggestions.forEach((task, index) => {
        response += `${index + 1}. ${task}\n`;
      });
    }

    // Save daily plan
    await this.neon.saveDailyPlan({
      userId: this.userId,
      date: new Date(),
      plannedTasks: {
        phdMinutes: Math.round(phdRemaining),
        workMinutes: Math.round(workRemaining),
        exerciseMinutes: hasRun ? 0 : 45
      },
      timeAllocated: Math.round(remainingHours * 60)
    });

    return response;
  }

  async getTodaysFocus(): Promise<string> {
    const [goals] = await Promise.all([
      this.neon.getHighLevelGoals(this.userId),
      this.neon.getTodaysCompletedTasks(this.userId)
    ]);

    // Find most urgent goals
    const urgentGoals = goals
      .filter(g => g.deadline && g.status === 'active')
      .map(g => ({
        ...g,
        daysLeft: differenceInDays(new Date(g.deadline), new Date())
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 2);

    if (urgentGoals.length === 0) {
      return "Maintain daily health goals and steady progress";
    }

    const focusItems = urgentGoals.map(g => 
      `${g.goal_name} (${g.daysLeft} days)`
    );

    return focusItems.join(', ');
  }

  async suggestTimeAllocation(input: string): Promise<string> {
    const [goals, completedTasks] = await Promise.all([
      this.neon.getHighLevelGoals(this.userId),
      this.neon.getTodaysCompletedTasks(this.userId)
    ]);

    // Extract requested category from input
    let requestedCategory: 'phd' | 'work' | null = null;
    if (input.toLowerCase().includes('phd') || input.toLowerCase().includes('research')) {
      requestedCategory = 'phd';
    } else if (input.toLowerCase().includes('work')) {
      requestedCategory = 'work';
    }

    // Get deadlines for calculation
    const septemberGoals = goals.filter(g => 
      g.deadline && 
      new Date(g.deadline).getMonth() === 8 && 
      new Date(g.deadline).getFullYear() === 2025
    );

    const phdDeadlines = septemberGoals
      .filter(g => g.category === 'phd')
      .map(g => differenceInDays(new Date(g.deadline), new Date()));
    
    const workDeadlines = septemberGoals
      .filter(g => g.category === 'work')
      .map(g => differenceInDays(new Date(g.deadline), new Date()));

    // Calculate allocation
    const allocation = calculateTimeAllocation(phdDeadlines, workDeadlines);

    // Get today's progress
    const todaysPhdMinutes = completedTasks
      .filter(t => t.goal_category === 'phd')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);
    
    const todaysWorkMinutes = completedTasks
      .filter(t => t.goal_category === 'work')
      .reduce((sum, t) => sum + (t.time_spent_minutes || 0), 0);

    let response = '';

    if (requestedCategory === 'phd') {
      const targetHours = allocation.phdHours;
      const completedHours = todaysPhdMinutes / 60;
      const remainingHours = Math.max(0, targetHours - completedHours);
      
      response = `📚 PhD Time Allocation:\n`;
      response += `• Target today: ${targetHours.toFixed(1)} hours\n`;
      response += `• Completed: ${completedHours.toFixed(1)} hours\n`;
      response += `• Remaining: ${remainingHours.toFixed(1)} hours\n\n`;
      
      if (remainingHours > 2) {
        response += `⚠️ You need a solid ${remainingHours.toFixed(1)}-hour block for PhD work today.\n`;
      }
      
      // List PhD deadlines
      const phdGoals = septemberGoals.filter(g => g.category === 'phd');
      if (phdGoals.length > 0) {
        response += `\n📅 PhD Deadlines:\n`;
        phdGoals.forEach(g => {
          const daysLeft = differenceInDays(new Date(g.deadline), new Date());
          response += `• ${g.goal_name}: ${daysLeft} days\n`;
        });
      }
    } else if (requestedCategory === 'work') {
      const targetHours = allocation.workHours;
      const completedHours = todaysWorkMinutes / 60;
      const remainingHours = Math.max(0, targetHours - completedHours);
      
      response = `💼 Work Time Allocation:\n`;
      response += `• Target today: ${targetHours.toFixed(1)} hours\n`;
      response += `• Completed: ${completedHours.toFixed(1)} hours\n`;
      response += `• Remaining: ${remainingHours.toFixed(1)} hours\n`;
    } else {
      // General allocation
      response = `⏰ Today's Time Allocation:\n\n`;
      response += `📚 PhD: ${allocation.phdHours.toFixed(1)} hours`;
      if (todaysPhdMinutes > 0) {
        response += ` (${(todaysPhdMinutes / 60).toFixed(1)}h done)`;
      }
      response += '\n';
      
      response += `💼 Work: ${allocation.workHours.toFixed(1)} hours`;
      if (todaysWorkMinutes > 0) {
        response += ` (${(todaysWorkMinutes / 60).toFixed(1)}h done)`;
      }
      response += '\n';
      
      response += `🏃 Exercise: 45 minutes\n`;
      response += `☕ Buffer: ${formatDuration(Math.round(allocation.bufferMinutes))}\n`;
      
      response += `\n📊 Progress: PhD ${Math.round((todaysPhdMinutes / 60) / allocation.phdHours * 100)}%, Work ${Math.round((todaysWorkMinutes / 60) / allocation.workHours * 100)}%`;
    }

    return response;
  }

  private getTimeBasedRecommendation(productivity: 'high' | 'medium' | 'low'): string {
    const hour = new Date().getHours();
    
    if (productivity === 'high') {
      return "Prime time for deep work! Focus on research, writing, or complex problem-solving.";
    } else if (productivity === 'medium') {
      return "Good time for meetings, reviews, or collaborative work.";
    } else {
      if (hour >= 16 && hour < 17) {
        return "Perfect time for your daily run! Exercise will refresh you for evening tasks.";
      }
      return "Lower energy period - tackle admin tasks, emails, or light planning.";
    }
  }

  private async getTopPriorityTasks(category: 'phd' | 'work'): Promise<string[]> {
    const goals = await this.neon.getHighLevelGoals(this.userId, category);
    
    // For now, return goal names as tasks
    // In production, this would query actual tasks from TickTick
    return goals
      .filter(g => g.status === 'active')
      .sort((a, b) => {
        const aDays = a.deadline ? differenceInDays(new Date(a.deadline), new Date()) : 999;
        const bDays = b.deadline ? differenceInDays(new Date(b.deadline), new Date()) : 999;
        return aDays - bDays;
      })
      .slice(0, 3)
      .map(g => {
        const daysLeft = g.deadline ? differenceInDays(new Date(g.deadline), new Date()) : null;
        return daysLeft ? `${g.goal_name} (${daysLeft} days left)` : g.goal_name;
      });
  }
}