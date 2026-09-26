import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PedalConnectionState } from '../../midi/pedal-connection';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';

const STATE_LABEL_KEYS: Record<PedalConnectionState, string> = {
  'not-connected': 'state_not_connected',
  connecting: 'state_connecting',
  connected: 'state_connected',
  error: 'state_error',
};

@Component({
  selector: 'app-pedal-connection-page',
  imports: [TranslocoDirective],
  templateUrl: './pedal-connection-page.html',
})
export class PedalConnectionPage {
  private readonly pedal = inject(WebMidiPedalConnection);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly stateLabelKey = computed(() => STATE_LABEL_KEYS[this.connectionState()]);
  readonly error = signal<string | null>(null);
  readonly connecting = computed(() => this.connectionState() === 'connecting');

  async connect(): Promise<void> {
    this.error.set(null);
    try {
      await this.pedal.connect();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'unknown');
    }
  }
}
