import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DarkModeToggle } from './shared/dark-mode-toggle/dark-mode-toggle';
import { LanguageSwitcher } from './shared/language-switcher/language-switcher';
import { MockPresetsStore } from './pedals/mock-presets.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DarkModeToggle, LanguageSwitcher, TranslocoDirective],
  templateUrl: './app.html',
})
export class App {
  private readonly mockPresetsStore = inject(MockPresetsStore);

  // v6: the "Load test presets" ghost link lives in the page header. Both
  // the header button and the preset-browser-page share `MockPresetsStore`
  // so clicking the header button populates the page data the same way the
  // v5 page-level button did.
  loadMockPresets(): void {
    this.mockPresetsStore.load();
  }
}