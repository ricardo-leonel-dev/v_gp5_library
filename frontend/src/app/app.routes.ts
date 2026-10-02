import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { environment } from '../environments/environment';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'songs' },
  {
    path: 'login',
    loadComponent: () => import('./auth/login-page/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register-page/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'songs',
    canActivate: [authGuard],
    loadComponent: () => import('./songs/songs-page/songs-page').then((m) => m.SongsPage),
  },
  {
    path: 'pedal',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pedals/pedal-connection-page/pedal-connection-page').then((m) => m.PedalConnectionPage),
  },
  {
    path: 'pedal/presets',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pedals/preset-browser-page/preset-browser-page').then((m) => m.PresetBrowserPage),
  },
  // F17 v6 pick surface — dev-only. The `environment.production` check is
  // resolved at build time: production builds swap `environment.ts` for
  // `environment.production.ts` (see angular.json `fileReplacements`),
  // which sets `production: true` and tree-shakes this route out.
  ...(environment.production
    ? []
    : [
        {
          path: 'playground',
          loadComponent: () =>
            import('./playground/playground-page').then((m) => m.PlaygroundF17V6),
        },
      ]),
];
