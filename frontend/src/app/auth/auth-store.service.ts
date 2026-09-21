import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'gp5_token';

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly tokenSignal = signal<string | null>(this.readStoredToken());
  private readonly userSignal = signal<AuthUser | null>(null);

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  setSession(token: string, user: AuthUser): void {
    this.tokenSignal.set(token);
    this.userSignal.set(user);
    localStorage.setItem(STORAGE_KEY, token);
  }

  clear(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private readStoredToken(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
