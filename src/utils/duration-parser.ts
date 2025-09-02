interface ParsedDuration {
  minutes: number;
  originalText: string;
  confidence: 'high' | 'medium' | 'low';
}

// Patterns for different duration formats
const DURATION_PATTERNS = [
  // Explicit formats: "2h", "30m", "1.5hrs"
  {
    pattern: /(\d+(?:\.\d+)?)\s*h(?:ours?)?/i,
    unit: 'hours',
    confidence: 'high' as const
  },
  {
    pattern: /(\d+)\s*m(?:ins?|inutes?)?/i,
    unit: 'minutes',
    confidence: 'high' as const
  },
  // Combined format: "1h 30m", "2 hours 15 minutes"
  {
    pattern: /(\d+)\s*h(?:ours?)?\s*(\d+)\s*m(?:ins?|inutes?)?/i,
    unit: 'combined',
    confidence: 'high' as const
  },
  // Approximate formats: "~45 mins", "about 2 hours"
  {
    pattern: /(?:~|about|approximately|around)\s*(\d+(?:\.\d+)?)\s*h(?:ours?)?/i,
    unit: 'hours',
    confidence: 'medium' as const
  },
  {
    pattern: /(?:~|about|approximately|around)\s*(\d+)\s*m(?:ins?|inutes?)?/i,
    unit: 'minutes',
    confidence: 'medium' as const
  },
  // Parenthetical format: "(2h)", "(45m)"
  {
    pattern: /\((\d+(?:\.\d+)?)\s*h(?:ours?)?\)/i,
    unit: 'hours',
    confidence: 'high' as const
  },
  {
    pattern: /\((\d+)\s*m(?:ins?|inutes?)?\)/i,
    unit: 'minutes',
    confidence: 'high' as const
  },
  // Dash format: "- 2h", "- 30 mins"
  {
    pattern: /-\s*(\d+(?:\.\d+)?)\s*h(?:ours?)?/i,
    unit: 'hours',
    confidence: 'high' as const
  },
  {
    pattern: /-\s*(\d+)\s*m(?:ins?|inutes?)?/i,
    unit: 'minutes',
    confidence: 'high' as const
  }
];

// Keywords that suggest time estimates
const TIME_KEYWORDS = {
  quick: 15,
  brief: 15,
  short: 30,
  medium: 60,
  long: 120,
  extended: 180
};

export function parseDurationFromText(input: string): ParsedDuration | null {
  // Try each pattern
  for (const { pattern, unit, confidence } of DURATION_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      let minutes = 0;
      
      if (unit === 'hours') {
        minutes = parseFloat(match[1]) * 60;
      } else if (unit === 'minutes') {
        minutes = parseInt(match[1]);
      } else if (unit === 'combined') {
        minutes = parseInt(match[1]) * 60 + parseInt(match[2]);
      }
      
      return {
        minutes: Math.round(minutes),
        originalText: match[0],
        confidence
      };
    }
  }
  
  // Check for time keywords
  const lowerInput = input.toLowerCase();
  for (const [keyword, defaultMinutes] of Object.entries(TIME_KEYWORDS)) {
    if (lowerInput.includes(keyword)) {
      return {
        minutes: defaultMinutes,
        originalText: keyword,
        confidence: 'low'
      };
    }
  }
  
  return null;
}

// Extract task title without duration
export function extractTaskTitleWithoutDuration(input: string): string {
  const duration = parseDurationFromText(input);
  if (!duration) return input;
  
  // Remove the duration text from the title
  return input
    .replace(duration.originalText, '')
    .replace(/\(\s*\)/, '') // Remove empty parentheses
    .replace(/\s*-\s*$/, '') // Remove trailing dash
    .replace(/\s+/g, ' ')
    .trim();
}

// Suggest duration based on task type
export function suggestDurationForTask(taskTitle: string): number | null {
  const lower = taskTitle.toLowerCase();
  
  // Research/Writing tasks
  if (lower.includes('review') || lower.includes('read')) return 60;
  if (lower.includes('write') || lower.includes('draft')) return 120;
  if (lower.includes('research')) return 90;
  
  // Meeting tasks
  if (lower.includes('meeting') || lower.includes('call')) return 60;
  if (lower.includes('standup') || lower.includes('sync')) return 30;
  if (lower.includes('presentation')) return 45;
  
  // Development tasks
  if (lower.includes('implement') || lower.includes('build')) return 180;
  if (lower.includes('fix') || lower.includes('debug')) return 90;
  if (lower.includes('test')) return 60;
  if (lower.includes('deploy')) return 45;
  
  // Admin tasks
  if (lower.includes('email')) return 30;
  if (lower.includes('update') || lower.includes('document')) return 45;
  if (lower.includes('plan') || lower.includes('organize')) return 60;
  
  return null;
}

// Format duration for display
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (mins === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${mins}m`;
}