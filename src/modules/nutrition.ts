import { NutritionLog } from '../types';
import { parseCaloriesFromText } from '../utils/food-parser';
import { differenceInHours } from 'date-fns';
import { NeonService } from '../services/neon';

export class NutritionModule {
  private userId: string;
  private dailyCalorieLimit: number = 1100;
  private neon: NeonService;

  constructor(userId: string, neonService: NeonService) {
    this.userId = userId;
    this.neon = neonService;
  }

  async logMeal(input: string): Promise<string> {
    const mealInfo = await parseCaloriesFromText(input);
    
    if (!mealInfo.calories) {
      return "I couldn't determine the calories. Please specify the calorie amount.";
    }

    const todaysCalories = await this.getTodaysCalories();
    const newTotal = todaysCalories.consumed + mealInfo.calories;
    const remaining = this.dailyCalorieLimit - newTotal;

    // Create nutrition log
    const log: NutritionLog = {
      id: this.generateId(),
      userId: this.userId,
      mealType: mealInfo.mealType || this.detectMealType(),
      description: mealInfo.description,
      calories: mealInfo.calories,
      protein: mealInfo.protein,
      carbs: mealInfo.carbs,
      fat: mealInfo.fat,
      loggedAt: new Date()
    };

    // Save to database
    await this.neon.logNutrition(log);

    // Check if ending fast
    let fastingMessage = '';
    const activeFasting = await this.neon.getActiveFastingSession(this.userId);
    if (activeFasting) {
      const fastingResult = await this.endFasting();
      fastingMessage = fastingResult.split('!')[0] + '!) ';
    }

    // Build response with warnings
    let response = `${fastingMessage}Logged ${mealInfo.mealType || 'meal'}: ${mealInfo.calories} calories`;
    
    if (newTotal > this.dailyCalorieLimit) {
      response += `\n⚠️ OVER BUDGET! Total: ${newTotal}/${this.dailyCalorieLimit} (+${newTotal - this.dailyCalorieLimit} over)`;
      response += `\nYou've exceeded your daily limit. Consider:`;
      response += `\n- Extra exercise to burn ${newTotal - this.dailyCalorieLimit} calories`;
      response += `\n- Compensate tomorrow with ${newTotal - this.dailyCalorieLimit} fewer calories`;
    } else if (remaining < 200) {
      response += `\n⚠️ Daily budget: ${remaining} calories remaining (strict ${this.dailyCalorieLimit} limit)`;
      if (remaining < 100) {
        response += `\nVery limited calories left! Consider:`;
        response += `\n- Skip next meal, have herbal tea`;
        response += `\n- Very light meal (${remaining} cal max)`;
      }
    } else {
      response += `\nDaily budget: ${remaining} calories remaining`;
      
      // Suggest meal planning
      const mealsLeft = this.getMealsLeftToday();
      if (mealsLeft > 0) {
        const avgPerMeal = Math.floor(remaining / mealsLeft);
        response += `\nSuggestion: ${avgPerMeal} cal per remaining meal to stay on target`;
      }
    }

    // Add weight loss reminder if close to limit
    if (newTotal > 900) {
      response += `\nRemember: 1,166 daily deficit needed for your 15 lb goal!`;
    }

    return response;
  }

  async startFasting(): Promise<string> {
    const activeFasting = await this.neon.getActiveFastingSession(this.userId);
    if (activeFasting) {
      const hours = differenceInHours(new Date(), activeFasting.startedAt);
      return `You're already fasting for ${hours} hours. Keep it up!`;
    }

    // Save to database
    await this.neon.startFastingSession(this.userId);

    const lastMeal = await this.getLastMealTime();
    const timeSinceLastMeal = lastMeal ? differenceInHours(new Date(), lastMeal) : 0;

    return `Fasting started! ${timeSinceLastMeal > 0 ? `(${timeSinceLastMeal} hours since last meal)` : ''}\nI'll track your fasting window. Good luck! 💪`;
  }

  async endFasting(): Promise<string> {
    const activeFasting = await this.neon.getActiveFastingSession(this.userId);
    if (!activeFasting) {
      return "You're not currently fasting. Would you like to start a fast?";
    }

    const endTime = new Date();
    const hours = differenceInHours(endTime, activeFasting.startedAt);
    
    // Save to database
    await this.neon.endFastingSession(activeFasting.id);

    let response = `Fast completed: ${hours} hours!`;
    
    if (hours >= 16) {
      response += ` Excellent 16+ hour fast! 🎉`;
    } else if (hours >= 14) {
      response += ` Good 14+ hour fast!`;
    } else if (hours >= 12) {
      response += ` Nice 12+ hour fast.`;
    } else {
      response += ` Short fast, but every bit helps.`;
    }

    return response;
  }

  async getFastingStatus(): Promise<{ isFasting: boolean; hours: number }> {
    const activeFasting = await this.neon.getActiveFastingSession(this.userId);
    if (!activeFasting) {
      return { isFasting: false, hours: 0 };
    }

    const hours = differenceInHours(new Date(), activeFasting.startedAt);
    return { isFasting: true, hours };
  }

  async getCalorieStatus(): Promise<string> {
    const todaysCalories = await this.getTodaysCalories();
    const remaining = this.dailyCalorieLimit - todaysCalories.consumed;
    const percentUsed = Math.round((todaysCalories.consumed / this.dailyCalorieLimit) * 100);

    let status = `Today's calories: ${todaysCalories.consumed}/${this.dailyCalorieLimit} (${percentUsed}% used)\n`;
    
    if (todaysCalories.consumed > this.dailyCalorieLimit) {
      status += `⚠️ OVER BUDGET by ${todaysCalories.consumed - this.dailyCalorieLimit} calories!\n`;
      status += `To maintain weight loss: burn extra calories or reduce tomorrow's intake.`;
    } else if (remaining < 200) {
      status += `⚠️ Only ${remaining} calories remaining!\n`;
      status += `Plan carefully for remaining meals.`;
    } else {
      status += `Remaining: ${remaining} calories\n`;
      
      // Add meal suggestions based on time of day
      const hour = new Date().getHours();
      if (hour < 12 && todaysCalories.consumed < 400) {
        status += `Suggestion: 400-cal breakfast, 400-cal lunch, 300-cal dinner`;
      } else if (hour < 16 && todaysCalories.consumed < 800) {
        const lunchBudget = Math.min(400, remaining - 300);
        status += `Suggestion: ${lunchBudget}-cal lunch, save ${remaining - lunchBudget} for dinner`;
      }
    }

    // Add fasting status if applicable
    const fastingStatus = await this.getFastingStatus();
    if (fastingStatus.isFasting) {
      status += `\n\nCurrently fasting: ${fastingStatus.hours} hours`;
    }

    return status;
  }

  async getTodaysCalories(): Promise<{ consumed: number; logs: NutritionLog[] }> {
    const logs = await this.neon.getTodaysNutrition(this.userId);
    const consumed = logs.reduce((sum, log) => sum + log.calories, 0);
    return { consumed, logs };
  }

  private detectMealType(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
    const hour = new Date().getHours();
    if (hour < 10) return 'breakfast';
    if (hour < 14) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
  }

  private getMealsLeftToday(): number {
    const hour = new Date().getHours();
    if (hour < 10) return 3; // breakfast, lunch, dinner
    if (hour < 14) return 2; // lunch, dinner
    if (hour < 20) return 1; // dinner
    return 0;
  }

  private async getLastMealTime(): Promise<Date | null> {
    const todaysCalories = await this.getTodaysCalories();
    if (todaysCalories.logs.length === 0) return null;
    
    return todaysCalories.logs
      .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime())[0]
      .loggedAt;
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}