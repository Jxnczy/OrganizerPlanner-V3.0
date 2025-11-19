
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

export const CATEGORIES = ['goal', 'focus', 'work', 'leisure', 'basics'] as const;
export type CategoryKey = typeof CATEGORIES[number];

export type DayTasks = {
  [K in CategoryKey]: Todo[];
};

export interface Week {
  [key: string]: DayTasks;
}

export type DropTarget =
  | { type: 'day'; day: string; category: CategoryKey }
  | { type: 'pool' }
  | null;

export type DraggedTaskInfo =
  | { source: 'week'; day: string; category: CategoryKey; todo: Todo; weekKey: string }
  | { source: 'pool'; todo: Todo }
  | null;