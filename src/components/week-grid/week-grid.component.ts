
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskService } from '../../services/task.service';
import { DayColumnComponent } from '../day-column/day-column.component';

@Component({
  selector: 'app-week-grid',
  templateUrl: './week-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, DayColumnComponent],
})
export class WeekGridComponent {
  taskService = inject(TaskService);
}