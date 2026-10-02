// Default environment — used by `ng serve` and any configuration that does
// NOT override this file via `fileReplacements` (angular.json). Mirrors the
// standard Angular convention: dev values here, production overrides via
// `environment.production.ts`.
//
// `production: false` keeps the F17 v6 playground route registered at
// `/playground`. The production build swaps this file for
// `environment.production.ts`, which sets `production: true`, and the
// playground route is then omitted from `app.routes.ts`.
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000',
};