import natural from 'natural';

export interface Intent {
  category: 'nutrition' | 'task' | 'health' | 'planning' | 'greeting' | 'status' | 'unknown';
  action?: string;
  confidence: number;
  entities?: Record<string, any>;
  subtype?: string;
}

interface Pattern {
  regex: RegExp;
  category: Intent['category'];
  action: string;
  extractor?: (match: RegExpMatchArray) => Record<string, any>;
}

export class IntentClassifier {
  private classifier: natural.BayesClassifier;
  private patterns: Pattern[];

  constructor() {
    this.classifier = new natural.BayesClassifier();
    this.patterns = this.initializePatterns();
    this.trainClassifier();
  }

  private initializePatterns(): Pattern[] {
    return [
      // Nutrition patterns
      {
        regex: /\b(log|ate|had|consumed?|breakfast|lunch|dinner|snack)\b.*\b(\d+)?\s*(cal|calories?|kcal)/i,
        category: 'nutrition',
        action: 'log_meal'
      },
      {
        regex: /\b(start|begin|starting)\s+(fast|fasting)/i,
        category: 'nutrition',
        action: 'start_fast'
      },
      {
        regex: /\b(end|stop|break|breaking)\s+(fast|fasting)/i,
        category: 'nutrition',
        action: 'end_fast'
      },
      {
        regex: /\b(how many|calories|cal)\s*(left|remaining|budget)/i,
        category: 'nutrition',
        action: 'check_calories'
      },
      {
        regex: /\b(over|exceed|budget)\s*(calories?|cal)/i,
        category: 'nutrition',
        action: 'check_calories'
      },
      
      // Task patterns
      {
        regex: /\b(add|create|new)\s+(task|todo)/i,
        category: 'task',
        action: 'add_task'
      },
      {
        regex: /\b(complete|done|finish|mark)\s+.*\b(task|vsf|paper|presentation)/i,
        category: 'task',
        action: 'complete_task'
      },
      {
        regex: /\b(what|next)\s+(should|to|task)/i,
        category: 'task',
        action: 'next_task'
      },
      {
        regex: /\b(show|list|september)\s+(deadline|due)/i,
        category: 'task',
        action: 'list_deadlines'
      },
      
      // Health patterns
      {
        regex: /\b(log|ran|run|completed?)\s*(\d+(?:\.\d+)?)\s*(mile|km)/i,
        category: 'health',
        action: 'log_run'
      },
      {
        regex: /\b(did i|have i)\s+(run|exercise)/i,
        category: 'health',
        action: 'check_run'
      },
      {
        regex: /\b(weekly?|week)\s+(stat|average|running)/i,
        category: 'health',
        action: 'weekly_stats'
      },
      
      // Planning patterns
      {
        regex: /\b(plan|schedule)\s+(my )?(day|today)/i,
        category: 'planning',
        action: 'plan_day'
      },
      {
        regex: /\b(how much|allocate|time)\s+(for )?(phd|work|research)/i,
        category: 'planning',
        action: 'time_allocation'
      },
      
      // Greeting patterns
      {
        regex: /^(good\s*(morning|afternoon|evening)|hello|hi|hey)/i,
        category: 'greeting',
        action: 'greet'
      },
      
      // Status patterns
      {
        regex: /\b(status|progress|how am i)/i,
        category: 'status',
        action: 'general_status'
      }
    ];
  }

  private trainClassifier(): void {
    // Nutrition training data
    this.classifier.addDocument('log breakfast eggs toast 300 calories', 'nutrition.log_meal');
    this.classifier.addDocument('ate lunch sandwich 500 cal', 'nutrition.log_meal');
    this.classifier.addDocument('had dinner pasta about 600 calories', 'nutrition.log_meal');
    this.classifier.addDocument('snack apple 95 calories', 'nutrition.log_meal');
    this.classifier.addDocument('start fasting', 'nutrition.start_fast');
    this.classifier.addDocument('begin fast after dinner', 'nutrition.start_fast');
    this.classifier.addDocument('end fast', 'nutrition.end_fast');
    this.classifier.addDocument('breaking fast with oatmeal', 'nutrition.end_fast');
    this.classifier.addDocument('how many calories left', 'nutrition.check_calories');
    this.classifier.addDocument('am I over budget', 'nutrition.check_calories');
    
    // Task training data
    this.classifier.addDocument('add task review VSF paper 2h', 'task.add_task');
    this.classifier.addDocument('create new task NSLC presentation prep', 'task.add_task');
    this.classifier.addDocument('mark VSF paper review done', 'task.complete_task');
    this.classifier.addDocument('completed presentation task took 3 hours', 'task.complete_task');
    this.classifier.addDocument('what should I work on next', 'task.next_task');
    this.classifier.addDocument('what task to do now', 'task.next_task');
    this.classifier.addDocument('show september deadlines', 'task.list_deadlines');
    this.classifier.addDocument('list all due dates', 'task.list_deadlines');
    
    // Health training data
    this.classifier.addDocument('ran 3 miles today', 'health.log_run');
    this.classifier.addDocument('completed 3.2 mile run', 'health.log_run');
    this.classifier.addDocument('did I run today', 'health.check_run');
    this.classifier.addDocument('have I exercised', 'health.check_run');
    this.classifier.addDocument('weekly running average', 'health.weekly_stats');
    this.classifier.addDocument('show week stats', 'health.weekly_stats');
    
    // Planning training data
    this.classifier.addDocument('plan my day', 'planning.plan_day');
    this.classifier.addDocument('schedule today', 'planning.plan_day');
    this.classifier.addDocument('how much time for PhD today', 'planning.time_allocation');
    this.classifier.addDocument('allocate time for research', 'planning.time_allocation');
    
    // Greeting training data
    this.classifier.addDocument('good morning', 'greeting.greet');
    this.classifier.addDocument('hello aegis', 'greeting.greet');
    this.classifier.addDocument('hi there', 'greeting.greet');
    
    // Status training data
    this.classifier.addDocument('show my status', 'status.general');
    this.classifier.addDocument('how am I doing', 'status.general');
    this.classifier.addDocument('daily progress', 'status.general');
    
    this.classifier.train();
  }

  async classify(input: string): Promise<Intent> {
    const lowerInput = input.toLowerCase();
    
    // First, check patterns for high-confidence matches
    for (const pattern of this.patterns) {
      const match = lowerInput.match(pattern.regex);
      if (match) {
        const entities = pattern.extractor ? pattern.extractor(match) : {};
        return {
          category: pattern.category,
          action: pattern.action,
          confidence: 0.9,
          entities
        };
      }
    }
    
    // Fall back to ML classifier
    const classification = this.classifier.getClassifications(lowerInput);
    if (classification.length > 0 && classification[0].value > 0.6) {
      const [category, action] = classification[0].label.split('.');
      return {
        category: category as Intent['category'],
        action,
        confidence: classification[0].value,
        entities: {}
      };
    }
    
    // Check for specific keywords to determine subtype
    const subtype = this.detectSubtype(lowerInput);
    if (subtype) {
      return {
        category: subtype.category,
        action: subtype.action,
        confidence: 0.7,
        subtype: subtype.subtype
      };
    }
    
    return {
      category: 'unknown',
      confidence: 0,
      entities: {}
    };
  }

  private detectSubtype(input: string): { category: Intent['category']; action: string; subtype: string } | null {
    // Status subtypes
    if (input.includes('calorie') || input.includes('food')) {
      return { category: 'status', action: 'status', subtype: 'calories' };
    }
    if (input.includes('task') || input.includes('todo')) {
      return { category: 'status', action: 'status', subtype: 'tasks' };
    }
    
    return null;
  }

  extractEntities(input: string, intent: Intent): Record<string, any> {
    const entities: Record<string, any> = {};
    
    switch (intent.category) {
      case 'nutrition':
        // Extract calorie amount
        const calorieMatch = input.match(/(\d+)\s*(cal|calories?|kcal)/i);
        if (calorieMatch) {
          entities.calories = parseInt(calorieMatch[1]);
        }
        
        // Extract meal type
        const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
        for (const meal of mealTypes) {
          if (input.toLowerCase().includes(meal)) {
            entities.mealType = meal;
            break;
          }
        }
        break;
        
      case 'task':
        // Extract duration
        const durationMatch = input.match(/(\d+)\s*h(?:ours?)?|(\d+)\s*m(?:ins?)?/i);
        if (durationMatch) {
          entities.duration = durationMatch[1] 
            ? parseInt(durationMatch[1]) * 60 
            : parseInt(durationMatch[2]);
        }
        
        // Extract task title (remove duration and command words)
        const taskTitle = input
          .replace(/\b(add|create|new|task|todo|complete|done|finish|mark)\b/gi, '')
          .replace(/(\d+\s*h(?:ours?)?|\d+\s*m(?:ins?)?)/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (taskTitle) {
          entities.title = taskTitle;
        }
        break;
        
      case 'health':
        // Extract distance
        const distanceMatch = input.match(/(\d+(?:\.\d+)?)\s*(mile|km)/i);
        if (distanceMatch) {
          entities.distance = parseFloat(distanceMatch[1]);
          entities.unit = distanceMatch[2].toLowerCase();
        }
        break;
    }
    
    return { ...entities, ...intent.entities };
  }
}