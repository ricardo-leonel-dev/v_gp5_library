import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './transloco-loader';
import { authInterceptor } from './auth/auth.interceptor';
import { routes } from './app.routes';
import { SYSEX_PRESET_CODEC } from './midi/sysex-preset-codec';
import { Gp5SysexPresetCodec } from './midi/gp5-sysex-preset-codec';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // `withFetch()` selects the Fetch-API backend instead of XHR. It is not
    // needed for `responseType: 'blob'` (both backends support it); it is
    // kept as Angular's recommended backend for the binary GETs
    // (`/songs/:id/files/preset`, F5 R6; `/songs/:id/files/cover`, F26).
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideTransloco({
      config: {
        availableLangs: ['es', 'en'],
        defaultLang: 'es',
        reRenderOnLangChange: true,
        prodMode: false,
      },
      loader: TranslocoHttpLoader,
    }),
    { provide: SYSEX_PRESET_CODEC, useClass: Gp5SysexPresetCodec },
  ],
};
