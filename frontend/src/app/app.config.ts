import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
    provideHttpClient(withInterceptors([authInterceptor])),
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
