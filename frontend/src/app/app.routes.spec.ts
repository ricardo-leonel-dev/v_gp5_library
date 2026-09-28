import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { PresetBrowserPage } from './pedals/preset-browser-page/preset-browser-page';

describe('app.routes', () => {
  const pedalRoute = routes.find((r) => r.path === 'pedal');
  const presetsRoute = routes.find((r) => r.path === 'pedal/presets');

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
});
