import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'gp5_dark_mode';

export function resolveInitialDarkMode(stored: string | null, prefersDark: boolean): boolean {
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return prefersDark;
}

@Injectable({ providedIn: 'root' })
export class DarkModeService {
  private readonly darkSignal = signal(this.readInitial());
  readonly isDark = this.darkSignal.asReadonly();

  constructor() {
    effect(() => {
      const dark = this.darkSignal();
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    });
  }

  toggle(): void {
    this.darkSignal.update((dark) => !dark);
  }

  private readInitial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
      return resolveInitialDarkMode(stored, prefersDark);
    } catch {
      return false;
    }
  }
}
