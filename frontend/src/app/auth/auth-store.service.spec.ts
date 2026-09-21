import { beforeEach, describe, expect, test } from 'vitest';
import { AuthStore } from './auth-store.service';

describe('AuthStore', () => {
  let store: AuthStore;

  beforeEach(() => {
    localStorage.clear();
    store = new AuthStore();
  });

  test('starts unauthenticated with no stored token', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.token()).toBeNull();
  });

  test('setSession marks the store authenticated and persists the token', () => {
    store.setSession('a-token', { id: '1', email: 'a@b.com', plan: 'free' });

    expect(store.isAuthenticated()).toBe(true);
    expect(store.token()).toBe('a-token');
    expect(localStorage.getItem('gp5_token')).toBe('a-token');
  });

  test('clear logs out and removes the persisted token', () => {
    store.setSession('a-token', { id: '1', email: 'a@b.com', plan: 'free' });

    store.clear();

    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('gp5_token')).toBeNull();
  });

  test('a fresh store picks up a token already in localStorage', () => {
    localStorage.setItem('gp5_token', 'existing-token');

    const restored = new AuthStore();

    expect(restored.isAuthenticated()).toBe(true);
    expect(restored.token()).toBe('existing-token');
  });
});
