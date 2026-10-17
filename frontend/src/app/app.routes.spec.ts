import { describe, expect, it } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { AuthStore } from './auth/auth-store.service';
import { leaveDraftGuard } from './songs/song-detail-page/leave-draft.guard';
import { PresetBrowserPage } from './pedals/preset-browser-page/preset-browser-page';
import { SongDetailPage } from './songs/song-detail-page/song-detail-page';

describe('app.routes', () => {
  const pedalRoute = routes.find((r) => r.path === 'pedal');
  const presetsRoute = routes.find((r) => r.path === 'pedal/presets');
  const detailRoute = routes.find((r) => r.path === 'songs/:id');

  it('defines a pedal/presets route guarded by the same canActivate as the pedal route (R13)', () => {
    expect(presetsRoute).toBeDefined();
    expect(presetsRoute?.canActivate).toEqual(pedalRoute?.canActivate);
    expect(presetsRoute?.canActivate).toEqual([authGuard]);
  });

  it('lazy-loads PresetBrowserPage as the pedal/presets route component (R13)', async () => {
    const load = presetsRoute?.loadComponent;
    expect(load).toBeDefined();
    // Angular's bundler unwraps `loadComponent: () => import(...).then((m) => m.PresetBrowserPage)`,
    // so the resolved value is the component class itself, not the module namespace.
    const resolved = (await load!()) as unknown;
    expect(resolved).toBe(PresetBrowserPage);
  });

  it('R26 — defines a songs/:id route guarded by authGuard', () => {
    expect(detailRoute).toBeDefined();
    expect(detailRoute?.canActivate).toEqual([authGuard]);
  });

  it('R26 — lazy-loads SongDetailPage as the songs/:id route component', async () => {
    const load = detailRoute?.loadComponent;
    expect(load).toBeDefined();
    const resolved = (await load!()) as unknown;
    expect(resolved).toBe(SongDetailPage);
  });

  it('F27 R48 — the songs/:id route registers leaveDraftGuard directly as its canDeactivate guard', () => {
    // Registered as the guard itself, not a lazy `() => import(...)` thunk:
    // the router would call such a thunk AS the guard and treat the
    // returned Promise<Function> as a pass, so the dialog never showed.
    expect(detailRoute?.canDeactivate).toEqual([leaveDraftGuard]);
  });

  // F27 R48-R50, R53 — drives the real route config through the Router.
  // Only the lazy components are swapped for stubs (the real page needs the
  // whole songs/MIDI provider tree); `confirmLeave()` on the stub mirrors
  // SongDetailPage's contract, which song-detail-page.spec.ts covers.
  describe('F27 R48-R50, R53 — leave guard through the Router', () => {
    @Component({ template: '' })
    class DetailStub {
      readonly hasUnsavedDraft = signal(false);
      readonly leavePrompt = signal<{ resolve: (leave: boolean) => void } | null>(null);
      confirmLeave(): boolean | Promise<boolean> {
        if (!this.hasUnsavedDraft()) return true;
        return new Promise<boolean>((resolve) => this.leavePrompt.set({ resolve }));
      }
    }

    @Component({ template: '' })
    class EmptyStub {}

    const stubbedRoutes: Routes = routes.map((r) =>
      r.loadComponent
        ? { ...r, loadComponent: () => (r === detailRoute ? DetailStub : EmptyStub) }
        : r,
    );

    async function openDetail(): Promise<{ router: Router; page: DetailStub }> {
      TestBed.configureTestingModule({
        providers: [
          provideRouter(stubbedRoutes),
          { provide: AuthStore, useValue: { isAuthenticated: () => true } },
        ],
      });
      const harness = await RouterTestingHarness.create();
      const page = await harness.navigateByUrl('/songs/1', DetailStub);
      return { router: TestBed.inject(Router), page };
    }

    // Let the guard run and the stub's Promise register the prompt.
    const settle = () => new Promise((r) => setTimeout(r, 0));

    it('R49 — with an edited draft, navigation is held and "Keep editing" stays on /songs/:id', async () => {
      const { router, page } = await openDetail();
      page.hasUnsavedDraft.set(true);
      const nav = router.navigateByUrl('/songs');
      await settle();
      expect(page.leavePrompt()).not.toBeNull();
      expect(router.url).toBe('/songs/1');
      page.leavePrompt()!.resolve(false);
      expect(await nav).toBe(false);
      expect(router.url).toBe('/songs/1');
    });

    it('R50 — with an edited draft, "Leave and discard" completes the navigation', async () => {
      const { router, page } = await openDetail();
      page.hasUnsavedDraft.set(true);
      const nav = router.navigateByUrl('/songs');
      await settle();
      expect(page.leavePrompt()).not.toBeNull();
      page.leavePrompt()!.resolve(true);
      expect(await nav).toBe(true);
      expect(router.url).toBe('/songs');
    });

    it('R53 — with no edited draft, navigation passes without a prompt', async () => {
      const { router, page } = await openDetail();
      expect(await router.navigateByUrl('/songs')).toBe(true);
      expect(page.leavePrompt()).toBeNull();
      expect(router.url).toBe('/songs');
    });
  });

  it('R1 — authenticated navigation to / lands on /songs (covered by the existing redirect)', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.redirectTo).toBe('songs');
  });
});
