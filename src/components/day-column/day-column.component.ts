import { ChangeDetectionStrategy, Component, inject, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../services/task.service';
import { Todo, CategoryKey, CATEGORIES } from '../../models/todo.model';

@Component({
  selector: 'app-day-column',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './day-column.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayColumnComponent {
  taskService = inject(TaskService);
  
  day = input.required<string>();
  dayIndex = input.required<number>();
  
  readonly categories = CATEGORIES;
  
  // Fixed slot configuration
  readonly slotCounts: Record<CategoryKey, number> = {
    'goal': 1,
    'focus': 3,
    'work': 3,
    'leisure': 2,
    'basics': 4
  };

  // Quick Add State
  isQuickAddOpen = signal(false);
  quickAddText = signal('');
  quickAddCategory = signal<CategoryKey>('work');

  isCurrentDay = computed(() => {
    return this.taskService.weekOffset() === 0 && this.dayIndex() === this.taskService.currentDayIndex();
  });

  isPast = computed(() => {
    const weekOffset = this.taskService.weekOffset();
    if (weekOffset < 0) return true;
    if (weekOffset > 0) return false;
    return this.dayIndex() < this.taskService.currentDayIndex();
  });

  isFutureDay = computed(() => {
    const weekOffset = this.taskService.weekOffset();
    if (weekOffset > 0) return true;
    if (weekOffset < 0) return false;
    return this.dayIndex() > this.taskService.currentDayIndex();
  });

  getRemainingSlotsForCategory(category: CategoryKey): number[] {
    const dayData = this.taskService.week()[this.day()];
    if (!dayData) return [];
    const currentCount = dayData[category].length;
    const max = this.slotCounts[category];
    return Array(Math.max(0, max - currentCount)).fill(0);
  }

  onWeekDragStart(event: DragEvent, todo: Todo, category: CategoryKey): void {
    const weekKey = this.taskService.currentWeekKey();
    event.dataTransfer?.setData('text/plain', '');
    this.taskService.onDragStart({ source: 'week', day: this.day(), category, todo, weekKey });
  }

  isDropTarget(category: CategoryKey): boolean {
    const target = this.taskService.activeDropTarget();
    return target?.type === 'day' && target.day === this.day() && target.category === category;
  }

  handleDrop(event: DragEvent, category: CategoryKey): void {
    event.preventDefault();
    event.stopPropagation();
    this.taskService.onDrop(this.day(), category);
  }

  initQuickAdd(category: CategoryKey): void {
    this.quickAddCategory.set(category);
    this.isQuickAddOpen.set(true);
  }

  submitQuickAdd(): void {
    if (this.quickAddText().trim()) {
        this.taskService.addTodoToDay(this.day(), this.quickAddCategory(), this.quickAddText(), 30);
        this.quickAddText.set('');
        this.isQuickAddOpen.set(false);
    } else {
        this.isQuickAddOpen.set(false);
    }
  }
}
