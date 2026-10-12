// F26 `library_first_startup` — the header connect button. Used on every
// authenticated route (R44); hidden when not authenticated (R45). The
// button drives `PedalConnectFlow.start()` and reads its `connectionState`
// + `reading` to choose the right label / disabled state (R46-R48, R67).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PedalConnectFlow } from '../pedal-connect-flow.service';

@Component({
  selector: 'app-pedal-connect-button',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pedal-connect-button.html',
})
export class PedalConnectButton {
  private readonly flow = inject(PedalConnectFlow);

  readonly supported = this.flow.supported;
  readonly connectionState = this.flow.connectionState;
  readonly reading = this.flow.reading;

  readonly disabled = computed(
    () => !this.supported || this.connectionState() === 'connecting' || this.reading(),
  );

  // R46-R48, R67.
  readonly label = computed<string>(() => {
    if (this.reading()) return 'pedalButton.reading';
    if (this.connectionState() === 'connected') return 'pedalButton.read';
    if (this.connectionState() === 'connecting') return 'pedalButton.connecting';
    return 'pedalButton.connect';
  });

  // R48: visible only when connected (the emerald dot before the label).
  readonly isConnected = computed(() => this.connectionState() === 'connected');

  // R49: title attribute for the disabled-on-unsupported state.
  readonly isUnsupported = computed(() => !this.supported);

  onClick(): void {
    void this.flow.start();
  }
}