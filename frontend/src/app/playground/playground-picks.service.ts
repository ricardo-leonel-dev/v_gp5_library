import { Injectable, Signal, signal } from '@angular/core';

// Surfaces Ricardo is picking from. Kept narrow on purpose: the 5
// named in the F17 v6 brief, nothing else.
export type PlaygroundSurface =
  | 'chassis'
  | 'block-detail'
  | 'chrome'
  | 'chain-strip'
  | 'nav';

export type PlaygroundVariant = 'A' | 'B' | 'C';

export interface PlaygroundPick {
  readonly surface: PlaygroundSurface;
  readonly variant: PlaygroundVariant;
}

// Dev-only pick store. Lives in memory only — not persisted, not synced
// to Notion, not stored in localStorage. Ricardo reloads the page, the
// picks go away, and he picks again. That is intentional: this is a
// side-by-side sandbox, not a saved vote.
@Injectable({ providedIn: 'root' })
export class PlaygroundPicks {
  private readonly picksSignal = signal<ReadonlyMap<PlaygroundSurface, PlaygroundVariant>>(
    new Map(),
  );

  readonly picks: Signal<ReadonlyMap<PlaygroundSurface, PlaygroundVariant>> =
    this.picksSignal.asReadonly();

  pick(surface: PlaygroundSurface, variant: PlaygroundVariant): void {
    const current = this.picksSignal();
    const next = new Map(current);
    next.set(surface, variant);
    this.picksSignal.set(next);
  }

  clear(surface: PlaygroundSurface): void {
    const current = this.picksSignal();
    if (!current.has(surface)) return;
    const next = new Map(current);
    next.delete(surface);
    this.picksSignal.set(next);
  }

  reset(): void {
    this.picksSignal.set(new Map());
  }
}