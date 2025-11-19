
export interface Todo {
  id: number;
  text: string;
  completed: boolean;
  urgent: boolean;
  important: boolean;
  duration: number;
  habit: boolean;
  sourceId?: number;
}

export type CategoryKey = 'goal' | 'focus' | 'core' | 'offTime' | 'chore';

export interface DayTasks {
  goal: Todo[];
  focus: Todo[];
  core: Todo[];
  offTime: Todo[];
  chore: Todo[];
}

export interface Week {
  [key: string]: DayTasks;
}

export type DropTarget =
  | { type: 'day'; day: string; category: CategoryKey }
  | { type: 'pool' }
  | null;