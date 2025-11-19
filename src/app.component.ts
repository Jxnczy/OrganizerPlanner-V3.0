import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { WeekGridComponent } from './components/week-grid/week-grid.component';
import { TaskService } from './services/task.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [SidebarComponent, WeekGridComponent],
  host: {
    '(document:dragend)': 'onDragEnd()',
    '(document:dragleave)': 'onDragLeave($event)',
    '(document:keydown.escape)': 'onKeydownEscape()',
  },
})
export class AppComponent {
  private taskService = inject(TaskService);
  private themeService = inject(ThemeService); // Inject to initialize

  onDragEnd(): void {
    // This listener is crucial to clean up state when a drag operation ends anywhere on the page.
    this.taskService.cleanupDragState();
  }

  onDragLeave(event: DragEvent): void {
    // Clean up if the user drags the item out of the browser window.
    if (event.clientX === 0 && event.clientY === 0) {
      this.taskService.cleanupDragState();
    }
  }
  
  onKeydownEscape(): void {
    // A global listener to cancel editing from anywhere in the app.
    if (this.taskService.editingTaskId() !== null) {
      this.taskService.cancelEdit();
    }
  }
}
