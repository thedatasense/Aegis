import { Activity } from '../types';
import { NeonService } from '../services/neon';
import { subDays } from 'date-fns';

export class HealthModule {
  private userId: string;
  private neon: NeonService;
  private dailyRunGoal: number = 3; // miles

  constructor(userId: string, neonService: NeonService) {
    this.userId = userId;
    this.neon = neonService;
  }

  async logRun(input: string): Promise<string> {
    // Extract distance from input
    const distanceMatch = input.match(/(\d+(?:\.\d+)?)\s*(mile|km|mi)?/i);
    if (!distanceMatch) {
      return "Please specify the distance you ran (e.g., '3 miles' or '5 km')";
    }

    let distance = parseFloat(distanceMatch[1]);
    const unit = distanceMatch[2]?.toLowerCase();
    
    // Convert km to miles if needed
    if (unit === 'km') {
      distance = distance / 1.60934;
    }

    // Extract duration if mentioned
    const durationMatch = input.match(/(\d+)\s*min(?:utes?)?|(\d+)\s*h(?:ours?)?/i);
    let duration = 30; // Default 30 minutes
    if (durationMatch) {
      duration = durationMatch[1] ? parseInt(durationMatch[1]) : parseInt(durationMatch[2]) * 60;
    }

    // Calculate approximate calories (rough estimate: 100 calories per mile)
    const calories = Math.round(distance * 100);

    const activity: Activity = {
      id: this.generateId(),
      userId: this.userId,
      type: 'run',
      distance,
      duration,
      calories,
      source: 'manual',
      performedAt: new Date()
    };

    // Save to database
    await this.neon.logActivity(activity);

    let response = `✅ Logged ${distance} mile run (${duration} minutes, ~${calories} calories burned)`;
    
    if (distance >= this.dailyRunGoal) {
      response += `\n🎯 Daily 3-mile goal achieved! Great job!`;
      
      // Check streak
      const streak = await this.getRunStreak();
      if (streak > 1) {
        response += `\n🔥 ${streak}-day running streak!`;
      }
    } else {
      const remaining = this.dailyRunGoal - distance;
      response += `\n📊 ${remaining.toFixed(1)} miles short of daily goal`;
    }

    // Add pace if we have duration
    const pace = duration / distance;
    response += `\n⏱️ Pace: ${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')} min/mile`;

    return response;
  }

  async checkDailyRun(): Promise<string> {
    const todaysActivities = await this.neon.getTodaysActivities(this.userId);
    const runs = todaysActivities.filter(a => a.type === 'run');
    
    if (runs.length === 0) {
      return `❌ No run logged today yet.\n🏃 Remember: 3 miles daily for your health goal!\nPerfect time: around ${this.getOptimalRunTime()}`;
    }

    const totalDistance = runs.reduce((sum, run) => sum + (run.distance || 0), 0);
    const totalDuration = runs.reduce((sum, run) => sum + run.duration, 0);
    const totalCalories = runs.reduce((sum, run) => sum + (run.calories || 0), 0);

    let response = `✅ Today's running:`;
    response += `\n- Distance: ${totalDistance.toFixed(1)} miles`;
    response += `\n- Duration: ${totalDuration} minutes`;
    response += `\n- Calories burned: ${totalCalories}`;

    if (totalDistance >= this.dailyRunGoal) {
      response += `\n\n🎯 Daily goal achieved!`;
    } else {
      response += `\n\n📊 ${(this.dailyRunGoal - totalDistance).toFixed(1)} miles remaining for daily goal`;
    }

    return response;
  }

  async getWeeklyStats(): Promise<string> {
    const weeklyActivities = await this.neon.getWeeklyActivities(this.userId);
    const runs = weeklyActivities.filter(a => a.type === 'run');
    
    if (runs.length === 0) {
      return "No runs logged this week. Time to get started! 🏃";
    }

    // Calculate stats
    const totalDistance = runs.reduce((sum, run) => sum + (run.distance || 0), 0);
    const totalDuration = runs.reduce((sum, run) => sum + run.duration, 0);
    const totalCalories = runs.reduce((sum, run) => sum + (run.calories || 0), 0);
    const avgDistance = totalDistance / runs.length;
    const avgPace = totalDuration / totalDistance;
    
    // Check daily goal achievement
    const daysWithRuns = new Set(runs.map(r => r.performedAt.toDateString())).size;
    const daysMetGoal = runs.filter(r => r.distance && r.distance >= this.dailyRunGoal).length;

    let response = `📊 Weekly Running Stats:\n`;
    response += `\n📈 Overview:`;
    response += `\n- Total runs: ${runs.length}`;
    response += `\n- Days active: ${daysWithRuns}/7`;
    response += `\n- Days meeting 3-mile goal: ${daysMetGoal}/7`;
    
    response += `\n\n🏃 Performance:`;
    response += `\n- Total distance: ${totalDistance.toFixed(1)} miles`;
    response += `\n- Average per run: ${avgDistance.toFixed(1)} miles`;
    response += `\n- Total time: ${Math.round(totalDuration / 60)}h ${totalDuration % 60}m`;
    response += `\n- Average pace: ${Math.floor(avgPace)}:${String(Math.round((avgPace % 1) * 60)).padStart(2, '0')} min/mile`;
    
    response += `\n\n🔥 Calories burned: ${totalCalories}`;
    
    // Goal progress
    const targetWeeklyMiles = this.dailyRunGoal * 7;
    const weeklyProgress = (totalDistance / targetWeeklyMiles) * 100;
    response += `\n\n🎯 Weekly goal progress: ${weeklyProgress.toFixed(0)}% (${totalDistance.toFixed(1)}/${targetWeeklyMiles} miles)`;
    
    // Recommendations
    if (daysWithRuns < 7) {
      response += `\n\n💡 Try to run every day for consistency!`;
    }
    if (avgDistance < this.dailyRunGoal) {
      response += `\n💡 Increase distance to meet your 3-mile daily goal`;
    }

    return response;
  }

  async getTodaysActivities(): Promise<Activity[]> {
    return await this.neon.getTodaysActivities(this.userId);
  }

  private async getRunStreak(): Promise<number> {
    let streak = 0;
    let currentDate = new Date();
    
    while (true) {
      const activities = await this.neon.getTodaysActivities(this.userId);
      const dayRuns = activities.filter(a => 
        a.type === 'run' && 
        a.performedAt.toDateString() === currentDate.toDateString() &&
        a.distance && a.distance >= this.dailyRunGoal
      );
      
      if (dayRuns.length === 0) {
        break;
      }
      
      streak++;
      currentDate = subDays(currentDate, 1);
      
      // Limit check to prevent infinite loop
      if (streak > 365) break;
    }
    
    return streak;
  }

  private getOptimalRunTime(): string {
    const currentHour = new Date().getHours();
    
    if (currentHour < 7) {
      return "7:00 AM (cool morning run)";
    } else if (currentHour < 10) {
      return "now! (perfect morning weather)";
    } else if (currentHour < 16) {
      return "4:00 PM (your preferred time)";
    } else if (currentHour < 19) {
      return "now! (great evening weather)";
    } else {
      return "tomorrow morning";
    }
  }

  private generateId(): string {
    return `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}