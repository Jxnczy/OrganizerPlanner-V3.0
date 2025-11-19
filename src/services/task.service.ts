import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { Todo, Week, CategoryKey, DayTasks, DropTarget, DraggedTaskInfo, CATEGORIES } from '../models/todo.model';
import { StorageService } from './storage.service';
import { AudioService } from './audio.service';

export type SaveStatus = 'All changes saved' | 'Saving...';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private storageService = inject(StorageService);
  private audioService = inject(AudioService);

  // Core State Signals
  readonly daysOfWeek: string[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  
  weekOffset = signal<number>(0);
  allWeeks = signal<{ [weekKey: string]: Week }>(this.storageService.get<{ [weekKey: string]: Week }>('planner-allWeeks') || {});
  todoPool = signal<Todo[]>(this.storageService.get<Todo[]>('planner-todoPool') || this.getInitialTodoPool());
  
  // UI & Interaction State Signals
  isDraggingTask = signal(false);
  draggedTaskInfo = signal<DraggedTaskInfo>(null);
  activeDropTarget = signal<DropTarget>(null);
  justCompletedTaskId = signal<number | null>(null);
  editingTaskId = signal<number | null>(null);
  editingTaskText = signal('');
  editingTaskDuration = signal<number | string>(30);
  saveStatus = signal<SaveStatus>('All changes saved');

  // Date & Week Computations
  weekDateObjects = computed(() => this.calculateWeekDates(this.weekOffset()));
  weekDates = computed(() => this.weekDateObjects().map(day => `${day.getDate().toString().padStart(2, '0')}.${(day.getMonth() + 1).toString().padStart(2, '0')}.${day.getFullYear().toString().slice(-2)}`));
  
  weekDateRange = computed(() => {
    const dates = this.weekDateObjects();
    if (dates.length < 7) return '';
    const firstDay = dates[0];
    const lastDay = dates[6];
    const format = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}`;
    return `${format(firstDay)} - ${format(lastDay)}`;
  });

  currentWeekKey = computed(() => {
    const monday = this.getMondayOfWeek(this.weekOffset());
    const year = monday.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (monday.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-W${String(weekNumber).padStart(2, '0')}`;
  });

  week = computed(() => {
    const key = this.currentWeekKey();
    const currentWeeks = this.allWeeks();
    return currentWeeks[key] || this.initializeWeek();
  });

  currentDayIndex = computed(() => {
    const today = new Date();
    const currentDay = today.getDay(); // Sunday - 0
    return currentDay === 0 ? 6 : currentDay - 1; // Monday - 0
  });

  // Task Pool Computations
  backlogPool = computed(() => this.todoPool().filter(t => !t.habit).sort((a, b) => b.id - a.id));
  
  basicsPool = computed(() => {
    const allTasksInWeek = Object.values(this.week()).flatMap((day: DayTasks) => Object.values(day).flat());
    const scheduledChoreSourceIds = new Set(allTasksInWeek.filter(task => task.sourceId != null).map(task => task.sourceId));
    return this.todoPool().filter(t => t.habit && !scheduledChoreSourceIds.has(t.id));
  });

  // Daily Stats
  private readonly dailyCapacity = 480; // 8 hours in minutes
  dailyLoad = computed(() => {
    const weekData = this.week();
    const result: Record<string, { total: number; percentage: number; color: string }> = {};
    for (const day of this.daysOfWeek) {
        const dayTasks = weekData[day];
        // FIX: Replaced problematic `concat` with `flat()` for a cleaner, more type-safe way to flatten the array of task arrays.
        // `Object.values` on a mapped type can be inferred as `unknown[]`, so we cast it to ensure type safety before flattening.
        const allDayTasks: Todo[] = (Object.values(dayTasks ?? {}) as Todo[][]).flat();
        // Explicitly type accumulator to avoid inference errors
        const totalMinutes = allDayTasks.reduce((sum: number, task: Todo) => sum + (task.duration || 0), 0);
        
        const percentage = this.dailyCapacity > 0 ? Math.min((totalMinutes / this.dailyCapacity) * 100, 100) : 0;
        result[day] = { total: totalMinutes, percentage, color: this.getLoadColor(percentage) };
    }
    return result;
  });

  constructor() {
    // Data Migration: Ensure new category keys exist for existing data (legacy chore/core/offTime -> basics/work/leisure)
    this.allWeeks.update(weeks => {
      // FIX: Added type assertion to prevent `JSON.parse` from returning `any` and polluting the signal's type.
      const updatedWeeks = JSON.parse(JSON.stringify(weeks)) as { [weekKey: string]: Week };
      let changed = false;
      Object.keys(updatedWeeks).forEach(weekKey => {
        const week = updatedWeeks[weekKey];
        this.daysOfWeek.forEach(day => {
          if (week[day]) {
             // Migrate Basics
             if (!week[day].basics) {
                week[day].basics = (week[day] as any).chore || [];
                delete (week[day] as any).chore;
                changed = true;
             }
             // Migrate Work
             if (!week[day].work) {
                week[day].work = (week[day] as any).core || [];
                delete (week[day] as any).core;
                changed = true;
             }
             // Migrate Leisure
             if (!week[day].leisure) {
                week[day].leisure = (week[day] as any).offTime || [];
                delete (week[day] as any).offTime;
                changed = true;
             }
             
             // Ensure Focus and Goal exist (just in case)
             if (!week[day].focus) { week[day].focus = []; changed = true; }
             if (!week[day].goal) { week[day].goal = []; changed = true; }
          }
        });
      });
      return changed ? updatedWeeks : weeks;
    });

    // Auto-create week if it doesn't exist on load
    if(!this.allWeeks()[this.currentWeekKey()]) {
      this.allWeeks.update(weeks => ({...weeks, [this.currentWeekKey()]: this.initializeWeek()}));
    }

    // Auto-save effect with status update
    effect((onCleanup) => {
      const weeks = this.allWeeks();
      const pool = this.todoPool();

      this.saveStatus.set('Saving...');

      const timeoutId = setTimeout(() => {
        this.storageService.set('planner-allWeeks', weeks);
        this.storageService.set('planner-todoPool', pool);
        this.saveStatus.set('All changes saved');
      }, 1200);

      onCleanup(() => {
        clearTimeout(timeoutId);
      });
    }, { allowSignalWrites: true });
  }

  // --- Public Methods for Components ---

  // Week Navigation
  navigateWeek(direction: number): void {
    this.weekOffset.update(val => val + direction);
    const newWeekKey = this.currentWeekKey();
    if (!this.allWeeks()[newWeekKey]) {
      this.allWeeks.update(weeks => ({ ...weeks, [newWeekKey]: this.initializeWeek() }));
    }
  }

  // Task Management
  addTodo(text: string, duration: number | string): void {
    const newTodo: Todo = {
      id: Date.now(),
      text: text.trim(),
      completed: false,
      urgent: false, // Default state is not urgent
      important: true, // Default state is important (Focus-like)
      duration: Number(duration) || 30,
      habit: false,
    };
    this.todoPool.update(pool => [newTodo, ...pool]);
  }

  addTodoToDay(day: string, category: CategoryKey, text: string, duration: number): void {
    const newTodo: Todo = {
        id: Date.now(),
        text: text.trim(),
        completed: false,
        urgent: category === 'goal' || category === 'work',
        important: category === 'goal' || category === 'focus',
        duration: duration,
        habit: false
    };

    const weekKey = this.currentWeekKey();
    this.allWeeks.update(currentWeeks => {
        // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
        const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
        // Ensure the week and day structure exists
        if(!newWeeks[weekKey]) newWeeks[weekKey] = this.initializeWeek();
        
        newWeeks[weekKey][day][category].push(newTodo);
        return newWeeks;
    });
  }

  toggleTodoCompletion(day: string, category: CategoryKey, todoId: number): void {
    const weekKey = this.currentWeekKey();
    let wasCompleted = false;

    this.allWeeks.update(currentWeeks => {
      // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
      const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
      const task = newWeeks[weekKey]?.[day]?.[category]?.find((t: Todo) => t.id === todoId);
      if (task) {
        wasCompleted = !task.completed;
        task.completed = !task.completed;
      }
      return newWeeks;
    });
    
    if (wasCompleted) {
      this.audioService.playSuccessSound();
      this.justCompletedTaskId.set(todoId);
      setTimeout(() => this.justCompletedTaskId.set(null), 1000);
    }
  }

  // Editing
  startEdit(todo: Todo): void {
    this.editingTaskId.set(todo.id);
    this.editingTaskText.set(todo.text);
    this.editingTaskDuration.set(todo.duration);
  }

  cancelEdit(): void {
    this.editingTaskId.set(null);
  }

  saveEdit(): void {
    const id = this.editingTaskId();
    if (id === null) return;

    const newText = this.editingTaskText();
    const newDuration = Number(this.editingTaskDuration()) || 0;
    const weekKey = this.currentWeekKey();
    let foundInWeek = false;

    this.allWeeks.update(currentWeeks => {
      // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
      const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
      const weekToUpdate = newWeeks[weekKey];

      // FIX: Add guards to prevent accessing properties on undefined, which could corrupt state and cause misleading errors.
      if (weekToUpdate) {
        for (const day of this.daysOfWeek) {
          const dayToUpdate = weekToUpdate[day];
          if (dayToUpdate) {
            for (const cat of Object.keys(dayToUpdate)) {
              const category = cat as CategoryKey;
              const task = dayToUpdate[category]?.find((t: Todo) => t.id === id);
              if (task) {
                task.text = newText;
                task.duration = newDuration;
                foundInWeek = true;
                return newWeeks;
              }
            }
          }
        }
      }
      return currentWeeks;
    });

    if (!foundInWeek) {
      this.todoPool.update(pool =>
        pool.map(t => (t.id === id ? { ...t, text: newText, duration: newDuration } : t))
      );
    }
    this.cancelEdit();
  }

  // Drag and Drop Handlers
  onDragStart(info: DraggedTaskInfo): void {
    this.draggedTaskInfo.set(info);
    this.isDraggingTask.set(true);
  }
  
  onDragEnter(target: DropTarget): void {
    this.activeDropTarget.set(target);
  }

  cleanupDragState(): void {
    this.isDraggingTask.set(false);
    this.draggedTaskInfo.set(null);
    this.activeDropTarget.set(null);
  }

  onDrop(day: string, category: CategoryKey): void {
    const data = this.draggedTaskInfo();
    if (!data) return;

    const todoToDrop = { ...data.todo, completed: false };
    const targetWeekKey = this.currentWeekKey();

    // Dynamically assign category properties if dragged from the pool
    if (data.source === 'pool') {
      switch(category) {
        case 'goal': 
          todoToDrop.urgent = true; 
          todoToDrop.important = true; 
          break;
        case 'focus': 
          todoToDrop.urgent = false; 
          todoToDrop.important = true; 
          break;
        case 'work': 
          todoToDrop.urgent = true; 
          todoToDrop.important = false; 
          break;
        case 'leisure':
        case 'basics': // Should not happen for pool tasks, but handle defensively
          todoToDrop.urgent = false; 
          todoToDrop.important = false; 
          break;
      }
    }
    
    // Perform validation before any state updates
    if (category === 'goal') {
        const goalIsOccupied = this.week()[day].goal.length > 0;
        const isMovingFromSameGoalSlot = data.source === 'week' && data.day === day && data.category === 'goal';
        if (goalIsOccupied && !isMovingFromSameGoalSlot) {
            return; // Goal slot is occupied, abort.
        }
    }

    // Handle habit instantiation as a special case
    if (todoToDrop.habit && data.source === 'pool') {
      const newInstance = { ...todoToDrop, id: Date.now(), sourceId: todoToDrop.id };
      this.allWeeks.update(currentWeeks => {
        // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
        const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
        newWeeks[targetWeekKey][day][category].push(newInstance);
        return newWeeks;
      });
      // Do not remove the original from the pool
      return;
    }

    // Perform the main atomic update on the week
    this.allWeeks.update(currentWeeks => {
        // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
        const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
        
        // 1. Remove from source if it's within the week
        if (data.source === 'week') {
            newWeeks[data.weekKey][data.day][data.category] = newWeeks[data.weekKey][data.day][data.category].filter((t: Todo) => t.id !== todoToDrop.id);
        }

        // 2. Add to destination
        newWeeks[targetWeekKey][day][category].push(todoToDrop);
        
        return newWeeks;
    });

    // 3. Remove from pool if source was the pool
    if (data.source === 'pool') {
        this.todoPool.update(pool => pool.filter(t => t.id !== todoToDrop.id));
    }
  }

  onPoolDrop(): void {
    const data = this.draggedTaskInfo();
    if (!data || data.source !== 'week') return;

    const { todo, day, category, weekKey } = data;

    // 1. Always remove the task from the week grid.
    this.allWeeks.update(currentWeeks => {
      // FIX: Added type assertion to prevent `JSON.parse` from returning `any`.
      const newWeeks = JSON.parse(JSON.stringify(currentWeeks)) as { [weekKey: string]: Week };
      if (newWeeks[weekKey]?.[day]?.[category]) {
        newWeeks[weekKey][day][category] = newWeeks[weekKey][day][category].filter((t: Todo) => t.id !== todo.id);
      }
      return newWeeks;
    });

    // 2. Only return regular tasks (non-instantiated habits) to the pool.
    // Instantiated habits are simply removed (deleted) when dragged back.
    if (todo.sourceId == null) {
      // Reset task to its default "category-less" state before returning
      const resetTodo = { ...todo, urgent: false, important: true };
      this.todoPool.update(pool => [resetTodo, ...pool]);
    }
  }

  // Data Management
  exportData(): void {
    const data = {
      allWeeks: this.allWeeks(),
      todoPool: this.todoPool(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importData(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        // FIX: Add type assertion to ensure data from file conforms to the expected type.
        if (data.allWeeks && data.todoPool) {
          this.allWeeks.set(data.allWeeks as { [weekKey: string]: Week });
          this.todoPool.set(data.todoPool as Todo[]);
          alert('Data imported successfully!');
        } else {
          alert('Invalid data file.');
        }
      } catch (err) {
        alert('Error parsing data file.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  // --- Private Helper Methods ---

  private initializeWeek(): Week {
    const week: Partial<Week> = {};
    for (const day of this.daysOfWeek) {
      week[day] = this.initializeDay();
    }
    return week as Week;
  }
  
  private initializeDay(): DayTasks {
    const day: Partial<DayTasks> = {};
    for (const category of CATEGORIES) {
        day[category] = [];
    }
    return day as DayTasks;
  }

  private getMondayOfWeek(weekOffset: number = 0): Date {
    const today = new Date();
    today.setDate(today.getDate() + weekOffset * 7);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(today.setDate(diff));
  }
  
  private calculateWeekDates(weekOffset: number = 0): Date[] {
    const monday = this.getMondayOfWeek(weekOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }

  private getLoadColor(percentage: number): string {
    if (percentage >= 95) return '#ef4444'; // Red-500
    if (percentage >= 75) return '#f97316'; // Orange-500
    if (percentage >= 50) return '#eab308'; // Yellow-500
    return '#22c55e'; // Green-500
  }

  private getInitialTodoPool(): Todo[] {
    return [
      { id: 1, text: 'Review quarterly report', completed: false, duration: 90, urgent: true, important: true, habit: false },
      { id: 2, text: 'Brainstorm marketing campaign', completed: false, duration: 60, urgent: false, important: true, habit: false },
      { id: 3, text: 'Schedule dentist appointment', completed: false, duration: 15, urgent: true, important: false, habit: false },
      { id: 4, text: 'Read one chapter of a book', completed: false, duration: 30, urgent: false, important: false, habit: false },
      { id: 5, text: 'Weekly grocery shopping', completed: false, duration: 75, urgent: false, important: false, habit: true, sourceId: 5 },
      { id: 6, text: 'Vacuum the house', completed: false, duration: 20, urgent: false, important: false, habit: true, sourceId: 6 },
      { id: 7, text: 'Pay monthly bills', completed: false, duration: 30, urgent: false, important: false, habit: true, sourceId: 7 },
      { id: 8, text: 'Take out the trash', completed: false, duration: 5, urgent: false, important: false, habit: true, sourceId: 8 },
      { id: 9, text: 'Meal prep for the week', completed: false, duration: 120, urgent: false, important: false, habit: true, sourceId: 9 },
    ];
  }
}
