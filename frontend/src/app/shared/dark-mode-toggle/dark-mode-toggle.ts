import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DarkModeService } from '../dark-mode.service';

@Component({
  selector: 'app-dark-mode-toggle',
  imports: [TranslocoDirective],
  templateUrl: './dark-mode-toggle.html',
})
export class DarkModeToggle {
  protected readonly darkMode = inject(DarkModeService);
}
