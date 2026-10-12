// F26 `library_first_startup` — the shared, root-provided store that
// holds the pedal's last real read. The header connect flow
// (`PedalConnectFlow.start()`) calls `read()` to populate the store,
// `/pedal/presets` mirrors it for its picker/chips/main area, and the
// library "New song" dialog snapshots the savable presets via
// `savableSnapshot()`. The store never sets presets from mocks and
// never makes HTTP calls (R56).

import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import type { Preset } from '../midi/preset';
import { WebMidiPedalConnection } from '../midi/web-midi-pedal-connection';

export type PedalPresetsLoadState = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable({ providedIn: 'root' })
export class PedalPresetsStore {
  private readonly pedal = inject(WebMidiPedalConnection);

  private readonly presetsSignal = signal<Preset[]>([]);
  private readonly loadStateSignal = signal<PedalPresetsLoadState>('idle');
  private readonly errorSignal = signal<string | null>(null);

  // Last successful real read; `[]` until the first one lands. Never
  // populated from mocks (mock data lives in `MockPresetsStore`,
  // consumed only by `/pedal/presets`).
  readonly presets: Signal<readonly Preset[]> = this.presetsSignal.asReadonly();
  readonly loadState: Signal<PedalPresetsLoadState> = this.loadStateSignal.asReadonly();
  readonly error: Signal<string | null> = this.errorSignal.asReadonly();

  // True when the user has a live pedal connection. `savableSnapshot()`
  // keys off this rather than `presets().length` so a fresh connect
  // before any read still returns `[]` (no usable presets yet).
  readonly isConnected = computed(() => this.pedal.connectionState() === 'connected');

  // In-flight dedupe (R55, R63, R64, R65). `readPresets()` itself rejects
  // `request_in_progress` on overlap (`web-midi-pedal-connection.ts`),
  // so two callers landing while one is running share the same promise.
  private inflight: Promise<void> | null = null;

  // R55, R56, R63, R64, R65. Maps raw pedal error messages to the same
  // keys the v6 preset browser page used (`presetBrowser.not_connected_error`,
  // `presetBrowser.request_in_progress`, raw message otherwise). This
  // keeps F26's surface consistent with F17 without inventing new ones.
  read(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.loadStateSignal.set('loading');
    this.errorSignal.set(null);
    const run = async (): Promise<void> => {
      try {
        const real = await this.pedal.readPresets();
        this.presetsSignal.set(real);
        this.loadStateSignal.set('loaded');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown';
        const key = message === 'not_connected' ? 'not_connected_error' : message;
        this.errorSignal.set(key);
        this.loadStateSignal.set('error');
      } finally {
        this.inflight = null;
      }
    };
    this.inflight = run();
    return this.inflight;
  }

  // R68 R60, R69. Connected + last real read with `raw` bytes (mocks
  // never have `raw`), in ascending slot order. Returns a **new** array
  // instance every call (R71 — the library page stores it as the
  // dialog's `availablePresets` and must not mutate). Empty when not
  // connected (R60) or when no read has happened yet.
  savableSnapshot(): Preset[] {
    if (!this.isConnected()) return [];
    const filtered = this.presetsSignal().filter((p) => p.raw !== undefined);
    return filtered.slice().sort((a, b) => a.slot - b.slot);
  }
}