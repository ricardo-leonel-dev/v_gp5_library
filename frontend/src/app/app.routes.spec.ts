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

  it('R1 — authenticated navigation to / lands on /songs (covered by the existing redirect)', () => {
    const root = routes.find((r) => r.path === '');
    expect(root?.redirectTo).toBe('songs');
  });
});
