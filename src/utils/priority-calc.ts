import { differenceInDays } from 'date-fns';

interface TaskPriorityFactors {
  deadline?: Date;
  goalCategory?: 'phd' | 'work' | 'health';
  goalPriority?: 'critical' | 'high' | 'medium' | 'low';
  estimatedDuration?: number; // minutes
  dependencies?: string[];
  isSeptemberDeadline?: boolean;
}

interface TimeSlot {
  startHour: number;
  endHour: number;
  availableMinutes: number;
  productivity: 'high' | 'medium' | 'low';
}

export function calculateTaskPriority(factors: TaskPriorityFactors): number {
  let score = 0;
  
  // 1. Deadline urgency (40% weight)
  if (factors.deadline) {
    const daysUntilDeadline = differenceInDays(factors.deadline, new Date());
    
    if (daysUntilDeadline < 0) {
      score += 40; // Overdue gets max deadline score
    } else if (daysUntilDeadline <= 3) {
      score += 38;
    } else if (daysUntilDeadline <= 7) {
      score += 35;
    } else if (daysUntilDeadline <= 14) {
      score += 30;
    } else if (daysUntilDeadline <= 30) {
      score += 20;
    } else {
      score += 10;
    }
  }
  
  // 2. Goal alignment (30% weight)
  if (factors.goalPriority) {
    const priorityScores = {
      critical: 30,
      high: 22,
      medium: 15,
      low: 8
    };
    score += priorityScores[factors.goalPriority];
  }
  
  // 3. Task size fitness (20% weight)
  if (factors.estimatedDuration) {
    const currentTime = getCurrentTimeSlot();
    
    if (factors.estimatedDuration <= currentTime.availableMinutes) {
      score += 20; // Perfect fit
    } else if (factors.estimatedDuration <= currentTime.availableMinutes + 30) {
      score += 15; // Can squeeze in
    } else if (factors.estimatedDuration <= 60) {
      score += 10; // Short task, easy to fit
    } else {
      score += 5; // Needs dedicated time block
    }
  }
  
  // 4. Dependencies (10% weight)
  if (factors.dependencies && factors.dependencies.length > 0) {
    score += 10; // Blocking other tasks
  }
  
  // 5. September 2025 deadline multiplier
  if (factors.isSeptemberDeadline) {
    score *= 1.5;
  }
  
  // Normalize to 0-100
  return Math.min(Math.round(score), 100);
}

export function getCurrentTimeSlot(): TimeSlot {
  const now = new Date();
  const currentHour = now.getHours();
  const minutesUntilNextHour = 60 - now.getMinutes();
  
  // Assume workday is 9 AM - 5 PM with lunch at 12-1
  let availableMinutes = 120; // Default 2-hour block
  let productivity: 'high' | 'medium' | 'low' = 'medium';
  
  if (currentHour >= 9 && currentHour < 12) {
    // Morning - high productivity for cognitive tasks
    productivity = 'high';
    availableMinutes = (12 - currentHour) * 60 - (60 - minutesUntilNextHour);
  } else if (currentHour >= 13 && currentHour < 15) {
    // Early afternoon - medium productivity
    productivity = 'medium';
    availableMinutes = (15 - currentHour) * 60 - (60 - minutesUntilNextHour);
  } else if (currentHour >= 15 && currentHour < 17) {
    // Late afternoon - low productivity for complex tasks
    productivity = 'low';
    availableMinutes = (17 - currentHour) * 60 - (60 - minutesUntilNextHour);
  }
  
  return {
    startHour: currentHour,
    endHour: currentHour + Math.floor(availableMinutes / 60),
    availableMinutes,
    productivity
  };
}

export function calculateTimeAllocation(
  phdDeadlines: number[], // days until each PhD deadline
  workDeadlines: number[], // days until each work deadline
  totalHours: number = 8
): {
  phdHours: number;
  workHours: number;
  exerciseMinutes: number;
  bufferMinutes: number;
} {
  // Calculate urgency scores
  const phdUrgency = calculateCategoryUrgency(phdDeadlines);
  const workUrgency = calculateCategoryUrgency(workDeadlines);
  
  // Normalize urgencies
  const totalUrgency = phdUrgency + workUrgency;
  const phdRatio = totalUrgency > 0 ? phdUrgency / totalUrgency : 0.5;
  const workRatio = totalUrgency > 0 ? workUrgency / totalUrgency : 0.5;
  
  // Fixed exercise time
  const exerciseMinutes = 45;
  const availableMinutes = totalHours * 60 - exerciseMinutes;
  
  // Calculate time allocation with 15% buffer
  const productiveMinutes = availableMinutes * 0.85;
  
  return {
    phdHours: (productiveMinutes * phdRatio) / 60,
    workHours: (productiveMinutes * workRatio) / 60,
    exerciseMinutes,
    bufferMinutes: availableMinutes * 0.15
  };
}

function calculateCategoryUrgency(deadlines: number[]): number {
  if (deadlines.length === 0) return 0;
  
  // Weight closer deadlines more heavily
  return deadlines.reduce((urgency, daysLeft) => {
    if (daysLeft <= 7) return urgency + 100;
    if (daysLeft <= 14) return urgency + 50;
    if (daysLeft <= 30) return urgency + 25;
    return urgency + 10;
  }, 0) / deadlines.length;
}

export function suggestTaskOrder(
  tasks: Array<{
    id: string;
    title: string;
    priority: number;
    estimatedDuration?: number;
    requiresHighFocus?: boolean;
  }>
): string[] {
  const currentSlot = getCurrentTimeSlot();
  
  // Sort tasks based on time of day and task characteristics
  const sortedTasks = [...tasks].sort((a, b) => {
    // High-focus tasks in high-productivity slots
    if (currentSlot.productivity === 'high') {
      if (a.requiresHighFocus && !b.requiresHighFocus) return -1;
      if (!a.requiresHighFocus && b.requiresHighFocus) return 1;
    }
    
    // Short tasks in low-productivity slots
    if (currentSlot.productivity === 'low') {
      const aDuration = a.estimatedDuration || 60;
      const bDuration = b.estimatedDuration || 60;
      if (aDuration < 30 && bDuration >= 30) return -1;
      if (aDuration >= 30 && bDuration < 30) return 1;
    }
    
    // Otherwise, sort by priority
    return b.priority - a.priority;
  });
  
  return sortedTasks.map(t => t.id);
}

export function calculateDeficitForWeightLoss(
  targetPounds: number,
  daysAvailable: number
): {
  dailyDeficit: number;
  weeklyDeficit: number;
  totalDeficit: number;
} {
  // 1 pound = ~3,500 calories
  const caloriesPerPound = 3500;
  const totalDeficit = targetPounds * caloriesPerPound;
  const dailyDeficit = Math.round(totalDeficit / daysAvailable);
  const weeklyDeficit = dailyDeficit * 7;
  
  return {
    dailyDeficit,
    weeklyDeficit,
    totalDeficit
  };
}