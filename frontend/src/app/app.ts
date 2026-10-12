import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DarkModeToggle } from './shared/dark-mode-toggle/dark-mode-toggle';
import { LanguageSwitcher } from './shared/language-switcher/language-switcher';
import { MockPresetsStore } from './pedals/mock-presets.store';
import { AuthStore } from './auth/auth-store.service';
import { PedalConnectFlow } from './pedals/pedal-connect-flow.service';
import { PedalConnectButton } from './pedals/pedal-connect-button/pedal-connect-button';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    DarkModeToggle,
    LanguageSwitcher,
    TranslocoDirective,
    PedalConnectButton,
  ],
  templateUrl: './app.html',
})
export class App {
  private readonly mockPresetsStore = inject(MockPresetsStore);
  private readonly auth = inject(AuthStore);
  private readonly flow = inject(PedalConnectFlow);
  private readonly router = inject(Router);

  // F26 R43-R45: only show the brand link and the connect button while
  // authenticated; the language/dark-mode controls and the mock link stay
  // visible to every visitor.
  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly flowError = this.flow.error;

  // v6 + F26: clicking the ghost link in the header populates the mock
  // store and (R58) navigates to `/pedal/presets` when not already there.
  // F29 will own what `/pedal/presets` shows after this navigation; F26
  // only owns the navigation.
  loadMockPresets(): void {
    this.mockPresetsStore.load();
    if (this.router.url !== '/pedal/presets') {
      void this.router.navigateByUrl('/pedal/presets');
    }
  }

  // R54 — clear the connect error strip.
  dismissConnectError(): void {
    this.flow.dismissError();
  }
}