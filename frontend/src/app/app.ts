import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DarkModeToggle } from './shared/dark-mode-toggle/dark-mode-toggle';
import { LanguageSwitcher } from './shared/language-switcher/language-switcher';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DarkModeToggle, LanguageSwitcher],
  templateUrl: './app.html',
})
export class App {}
