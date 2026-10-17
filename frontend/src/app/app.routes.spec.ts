import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
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

  it('F27 R48 — the songs/:id route uses leaveDraftGuard as a canDeactivate guard', async () => {
    const guards = detailRoute?.canDeactivate;
    expect(guards).toBeDefined();
    expect(guards!.length).toBe(1);
    // The route's canDeactivate is a function that returns a Promise of
    // the guard (already unwrapped from the dynamic import). Calling it
    // yields the CanDeactivateFn.
    const raw = guards![0] as unknown as () => Promise<unknown>;
    const guard = (await raw()) as (
      c: { confirmLeave: () => boolean | Promise<boolean> },
    ) => boolean | Promise<boolean>;
    expect(typeof guard).toBe('function');
    // The guard delegates to SongDetailPage.confirmLeave(); a stub page
    // with a confirmLeave() that returns true must pass the guard.
    expect(guard({ confirmLeave: () => true })).toBe(true);
    expect(guard({ confirmLeave: () => false })).toBe(false);
  });

  it('R1 — authenticated navigation to / lands on /songs (covered by the existing redirect)', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.redirectTo).toBe('songs');
  });
});
