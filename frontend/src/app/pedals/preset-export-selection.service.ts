import { Injectable, Signal, signal } from '@angular/core';

// Multi-select store used to mark preset slots for a future export action
// (R26-R29). It is in memory only; marks do not survive a reload and are
// independent from `SelectedPresetStore` so toggling one never disturbs
// the other (R31, R32). The set is replaced on every change so the signal
// notifies.
@Injectable({ providedIn: 'root' })
export class PresetExportSelection {
  private readonly markedSlotsSignal = signal<ReadonlySet<number>>(new Set());
  readonly markedSlots: Signal<ReadonlySet<number>> = this.markedSlotsSignal.asReadonly();

  toggle(slot: number): void {
    const current = this.markedSlotsSignal();
    const next = new Set(current);
    if (next.has(slot)) {
      next.delete(slot);
    } else {
      next.add(slot);
    }
    this.markedSlotsSignal.set(next);
  }

  clear(): void {
    this.markedSlotsSignal.set(new Set());
  }
}