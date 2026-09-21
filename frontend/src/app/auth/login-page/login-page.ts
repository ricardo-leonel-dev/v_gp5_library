import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthApi } from '../auth-api.service';
import { AuthStore } from '../auth-store.service';

@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, TranslocoDirective],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly authApi = inject(AuthApi);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  async submit(): Promise<void> {
    this.error.set(null);
    this.submitting.set(true);
    try {
      const { token, user } = await this.authApi.login(this.email(), this.password());
      this.authStore.setSession(token, user);
      await this.router.navigateByUrl('/songs');
    } catch {
      this.error.set('login_error');
    } finally {
      this.submitting.set(false);
    }
  }
}
