// F4 `save_preset_dialog` — single-call HTTP service for `POST /songs`.
// Browser sets the multipart Content-Type with boundary automatically
// (R91); `authInterceptor` adds the Bearer token and clears the session on
// 401. No `withCredentials`.

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { CreatedSong } from './song';

@Injectable({ providedIn: 'root' })
export class SongsApi {
  private readonly http = inject(HttpClient);

  createSong(form: FormData): Promise<CreatedSong> {
    return firstValueFrom(
      this.http.post<CreatedSong>(`${environment.apiBaseUrl}/songs`, form),
    );
  }
}