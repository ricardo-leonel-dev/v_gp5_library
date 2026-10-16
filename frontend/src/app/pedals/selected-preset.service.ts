import { Injectable, signal } from '@angular/core';
import type { Preset } from '../midi/preset';

@Injectable({ providedIn: 'root' })
export class SelectedPresetStore {
  private readonly selectedPresetSignal = signal<Preset | null>(null);
  readonly selectedPreset = this.selectedPresetSignal.asReadonly();

  select(preset: Preset): void {
    this.selectedPresetSignal.set(preset);
  }

  clear(): void {
    this.selectedPresetSignal.set(null);
  }
}