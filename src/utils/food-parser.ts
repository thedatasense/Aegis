interface ParsedMealInfo {
  description: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
}

// Common food items with typical calorie values
const FOOD_CALORIES: Record<string, number> = {
  // Breakfast items
  'egg': 70,
  'eggs': 70,
  'toast': 80,
  'bread': 80,
  'oatmeal': 150,
  'cereal': 120,
  'yogurt': 100,
  'banana': 105,
  'apple': 95,
  'orange': 62,
  'berries': 50,
  
  // Lunch/Dinner items
  'sandwich': 350,
  'salad': 150,
  'soup': 200,
  'chicken': 165,
  'fish': 140,
  'rice': 200,
  'pasta': 220,
  'pizza': 285,
  'burger': 550,
  'steak': 280,
  
  // Snacks
  'chips': 150,
  'cookie': 80,
  'cookies': 80,
  'nuts': 170,
  'protein bar': 200,
  'coffee': 5,
  'tea': 2,
  
  // Drinks
  'soda': 140,
  'juice': 110,
  'milk': 150,
  'beer': 150,
  'wine': 125
};

// Meal type keywords
const MEAL_KEYWORDS = {
  breakfast: ['breakfast', 'morning', 'brunch'],
  lunch: ['lunch', 'midday', 'noon'],
  dinner: ['dinner', 'supper', 'evening'],
  snack: ['snack', 'treat']
};

export async function parseCaloriesFromText(input: string): Promise<ParsedMealInfo> {
  const lowerInput = input.toLowerCase();
  const result: ParsedMealInfo = {
    description: input
  };

  // Extract explicit calorie value (e.g., "350 calories", "~400 cal")
  const calorieMatch = lowerInput.match(/(\d+)\s*(?:calories?|cals?|kcals?)/);
  if (calorieMatch) {
    result.calories = parseInt(calorieMatch[1]);
  }

  // Extract "around/about X calories"
  const aboutMatch = lowerInput.match(/(?:around|about|approximately|~)\s*(\d+)\s*(?:calories?|cals?)?/);
  if (aboutMatch && !result.calories) {
    result.calories = parseInt(aboutMatch[1]);
  }

  // If no explicit calories, estimate from food items
  if (!result.calories) {
    let estimatedCalories = 0;
    let itemsFound = 0;

    for (const [food, calories] of Object.entries(FOOD_CALORIES)) {
      if (lowerInput.includes(food)) {
        // Check for quantity
        const quantityMatch = lowerInput.match(new RegExp(`(\\d+)\\s*${food}`));
        const quantity = quantityMatch ? parseInt(quantityMatch[1]) : 1;
        
        estimatedCalories += calories * quantity;
        itemsFound++;
      }
    }

    if (itemsFound > 0) {
      result.calories = estimatedCalories;
    }
  }

  // Detect meal type
  for (const [mealType, keywords] of Object.entries(MEAL_KEYWORDS)) {
    if (keywords.some(keyword => lowerInput.includes(keyword))) {
      result.mealType = mealType as any;
      break;
    }
  }

  // Extract macros if mentioned
  const proteinMatch = lowerInput.match(/(\d+)\s*(?:g|grams?)?\s*protein/);
  if (proteinMatch) {
    result.protein = parseInt(proteinMatch[1]);
  }

  const carbsMatch = lowerInput.match(/(\d+)\s*(?:g|grams?)?\s*carbs?/);
  if (carbsMatch) {
    result.carbs = parseInt(carbsMatch[1]);
  }

  const fatMatch = lowerInput.match(/(\d+)\s*(?:g|grams?)?\s*fats?/);
  if (fatMatch) {
    result.fat = parseInt(fatMatch[1]);
  }

  // Clean up description
  result.description = input
    .replace(/\b\d+\s*(?:calories?|cals?|kcals?)\b/gi, '')
    .replace(/\b(?:around|about|approximately|~)\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

// Helper function to suggest calories for common meal descriptions
export function suggestCaloriesForMeal(description: string): number | null {
  const lower = description.toLowerCase();
  
  // Common meal patterns
  if (lower.includes('light') || lower.includes('small')) {
    if (lower.includes('breakfast')) return 300;
    if (lower.includes('lunch')) return 400;
    if (lower.includes('dinner')) return 400;
    if (lower.includes('snack')) return 100;
  }
  
  if (lower.includes('regular') || lower.includes('medium')) {
    if (lower.includes('breakfast')) return 400;
    if (lower.includes('lunch')) return 500;
    if (lower.includes('dinner')) return 600;
    if (lower.includes('snack')) return 150;
  }
  
  if (lower.includes('large') || lower.includes('big')) {
    if (lower.includes('breakfast')) return 500;
    if (lower.includes('lunch')) return 700;
    if (lower.includes('dinner')) return 800;
    if (lower.includes('snack')) return 250;
  }
  
  return null;
}