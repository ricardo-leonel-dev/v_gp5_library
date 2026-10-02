import { Injectable, Signal, signal } from '@angular/core';

// Multi-select store for the v5 comparison feature (R18). Selected presets
// render their 5×2 board inline inside the drawer (and inside the compact
// list when the drawer is closed). The set is in-memory only — not
// persisted across reloads. Every mutation replaces `selectedSlots()` with
// a new `Set` instance so the signal notifies.
@Injectable({ providedIn: 'root' })
export class PresetComparisonStore {
  private readonly selectedSlotsSignal = signal<ReadonlySet<number>>(new Set());
  readonly selectedSlots: Signal<ReadonlySet<number>> = this.selectedSlotsSignal.asReadonly();

  toggle(slot: number): void {
    const current = this.selectedSlotsSignal();
    const next = new Set(current);
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    this.selectedSlotsSignal.set(next);
  }

  add(slot: number): void {
    const current = this.selectedSlotsSignal();
    if (current.has(slot)) return;
    const next = new Set(current);
    next.add(slot);
    this.selectedSlotsSignal.set(next);
  }

  remove(slot: number): void {
    const current = this.selectedSlotsSignal();
    if (!current.has(slot)) return;
    const next = new Set(current);
    next.delete(slot);
    this.selectedSlotsSignal.set(next);
  }

  clear(): void {
    this.selectedSlotsSignal.set(new Set());
  }
}