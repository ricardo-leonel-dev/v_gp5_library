import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Preset } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { SelectedPresetStore } from '../selected-preset.service';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-preset-browser-page',
  imports: [TranslocoDirective],
  templateUrl: './preset-browser-page.html',
})
export class PresetBrowserPage implements OnInit {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly selectedPresetStore = inject(SelectedPresetStore);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly loadState = signal<LoadState>('idle');
  readonly presets = signal<Preset[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.supported) return;
    if (this.connectionState() !== 'connected') return;
    void this.loadPresets();
  }

  chainSummary(preset: Preset): string {
    return preset.chain
      .filter((entry) => entry.enabled)
      .map((entry) => entry.moduleType)
      .join(', ');
  }

  selectPreset(preset: Preset): void {
    this.selectedPresetStore.select(preset);
  }

  private async loadPresets(): Promise<void> {
    this.loadState.set('loading');
    this.error.set(null);
    try {
      this.presets.set(await this.pedal.readPresets());
      this.loadState.set('loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      // 'not_connected' is also the guard-state key (see the template's
      // outer not-connected branch, worded as a "please connect" prompt) —
      // map it to the distinct 'not_connected_error' key here so a
      // mid-operation disconnect renders "the pedal is not connected"
      // instead of reusing that unrelated prompt's copy.
      this.error.set(message === 'not_connected' ? 'not_connected_error' : message);
      this.loadState.set('error');
    }
  }
}
