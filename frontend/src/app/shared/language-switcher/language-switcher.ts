import { Component, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-language-switcher',
  templateUrl: './language-switcher.html',
})
export class LanguageSwitcher {
  protected readonly transloco = inject(TranslocoService);

  setLang(lang: string): void {
    this.transloco.setActiveLang(lang);
  }
}
