import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

export type UnsupportedBrowserVariant = 'full' | 'compact';

@Component({
  selector: 'app-unsupported-browser-message',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './unsupported-browser-message.html',
})
export class UnsupportedBrowserMessage {
  readonly variant = input<UnsupportedBrowserVariant>('full');
  // Unique per instance so two messages on one screen never share an id
  // (same pattern as WriteToPedalDialog.titleId).
  readonly titleId = `unsupported-browser-title-${Math.random().toString(36).slice(2, 10)}`;
  // Web MIDI is only exposed in secure contexts, so on http:// the cause may be
  // the connection, not the browser. Strict `=== false`: an environment without
  // the property (jsdom) counts as secure.
  readonly insecure = globalThis.isSecureContext === false;
}
