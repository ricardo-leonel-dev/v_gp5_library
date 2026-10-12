// F26 `library_first_startup` — the header connect button's flow. Shared
// by the page header (R44-R54) and the library empty-state CTA (R12)
// so the same error surfaces once and one click triggers exactly one
// `connect()` + one read (R63-R65). The flow never touches `SongsApi`,
// `HttpClient` or saved songs (R56).

import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WebMidiPedalConnection } from '../midi/web-midi-pedal-connection';
import { PedalPresetsStore } from './pedal-presets.store';

@Injectable({ providedIn: 'root' })
export class PedalConnectFlow {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly router = inject(Router);
  private readonly presets = inject(PedalPresetsStore);

  // True on browsers that do not support Web MIDI. The header button
  // surfaces this as a disabled + tooltip state (R49).
  readonly supported: boolean = this.pedal.isSupported();

  // Snapshot of the pedal's `connectionState` so templates can read it
  // without pulling `WebMidiPedalConnection` directly.
  readonly connectionState = this.pedal.connectionState;

  // Translated error key (under `pedal.*`); null while idle. The key is
  // the message `err.message` mapped to one of the pedal's existing
  // raw messages — see `pedal.midi_access_denied` etc. (R53).
  readonly error = signal<string | null>(null);

  // Convenience for templates: true while the shared `PedalPresetsStore`
  // is loading (R67). The header button uses this to disable + relabel
  // itself while a header-triggered read is in flight.
  readonly reading = computed(() => this.presets.loadState() === 'loading');

  // R50-R54, R63-R65. Click handler used by both the header button and
  // the empty-state CTA. Returns a promise so the empty-state test can
  // stub it; the header doesn't await it.
  async start(): Promise<void> {
    this.error.set(null);
    if (!this.supported) return;
    if (this.connectionState() === 'connecting') return;
    if (this.connectionState() === 'connected') {
      // R52: already connected — just navigate; R64: trigger a fresh read.
      await this.router.navigateByUrl('/pedal/presets');
      void this.presets.read();
      return;
    }
    // R50: not-connected path.
    try {
      await this.pedal.connect();
    } catch (err) {
      this.error.set(this.mapError(err));
      return;
    }
    // R51: navigate on resolve; R65: trigger a fresh read.
    await this.router.navigateByUrl('/pedal/presets');
    void this.presets.read();
  }

  // R54 — clear the error strip on the next click or explicit dismiss.
  dismissError(): void {
    this.error.set(null);
  }

  // R53 — map the pedal's raw error message to a translation key under
  // `pedal.*`. Unknown messages fall back to `pedal.unknown` so a new
  // raw message (e.g. a future `unsupported_browser`) still surfaces
  // something readable.
  private mapError(err: unknown): string {
    const message = err instanceof Error ? err.message : 'unknown';
    switch (message) {
      case 'midi_access_denied':
        return 'midi_access_denied';
      case 'gp5_not_found':
        return 'gp5_not_found';
      case 'unsupported':
        return 'unsupported';
      default:
        return 'unknown';
    }
  }
}