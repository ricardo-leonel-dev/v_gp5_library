import { Injectable, Signal, signal } from '@angular/core';
import type { Preset } from '../midi/preset';
import { loadMockPresets } from './mock-presets';

// v6: the "Load test presets" control moves from the preset-browser-page
// into the page header (`src/app/app.html`). Both the header button and the
// page need access to the same `presets` signal so the chrome ghost link
// populates the data the page renders. This root-provided service is that
// shared signal.
//
// The data shape matches `Preset` (the same shape `readPresets()` returns)
// so the page can render either source through the same code path.
@Injectable({ providedIn: 'root' })
export class MockPresetsStore {
  private readonly presetsSignal = signal<Preset[]>([]);
  readonly presets: Signal<Preset[]> = this.presetsSignal.asReadonly();

  load(): Preset[] {
    const next = loadMockPresets();
    this.presetsSignal.set(next);
    return next;
  }

  clear(): void {
    this.presetsSignal.set([]);
  }
}