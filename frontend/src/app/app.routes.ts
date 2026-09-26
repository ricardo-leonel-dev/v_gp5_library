import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

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
];
