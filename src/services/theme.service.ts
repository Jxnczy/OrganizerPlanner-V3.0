import { Injectable, signal, effect, inject } from '@angular/core';
import { StorageService } from './storage.service';

export type Theme = 'dark' | 'blue' | 'classic';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private storageService = inject(StorageService);
  private _theme = signal<Theme>((this.storageService.get('planner-theme') as Theme) || 'blue');
  
  public readonly theme = this._theme.asReadonly();

  constructor() {
    // Effect to apply the theme class to the body and save to storage
    effect(() => {
      const currentTheme = this._theme();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('theme-dark', 'theme-blue', 'theme-classic');
        document.body.classList.add(`theme-${currentTheme}`);
      }
      this.storageService.set('planner-theme', currentTheme);
    });
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
  }
}