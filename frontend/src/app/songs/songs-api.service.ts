// F4 `save_preset_dialog` — single-call HTTP service for `POST /songs`.
// Browser sets the multipart Content-Type with boundary automatically
// (R91); `authInterceptor` adds the Bearer token and clears the session on
// 401. No `withCredentials`.
//
// F5 `import_preset_to_pedal` — `getSongPreset` returns the exact 507-byte
// `.prst` the backend stored (R6, R7). The dialog passes the bytes
// through `decodeSongPreset` and re-uses the body + name field verbatim
// when calling `writePreset` (R13, R42).
//
// F26 `library_first_startup` — `listSongs` returns the user's saved
// songs (F26 R2). F5 also uses it to populate the minimal song-card
// grid in the songs page (F5 R3, R53).

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { CreatedSong, Song } from './song';

@Injectable({ providedIn: 'root' })
export class SongsApi {
  private readonly http = inject(HttpClient);

  createSong(form: FormData): Promise<CreatedSong> {
    return firstValueFrom(
      this.http.post<CreatedSong>(`${environment.apiBaseUrl}/songs`, form),
    );
  }

  // F26 R2 / F5 R3.
  listSongs(): Promise<Song[]> {
    return firstValueFrom(this.http.get<Song[]>(`${environment.apiBaseUrl}/songs`));
  }

  // F5 R6 — backend returns the full 507-byte .prst the user originally
  // saved; the dialog decodes it (R7, R13) and writes the body + name
  // field back to a slot byte-exact (R42, R47).
  async getSongPreset(songId: string, sortOrder: number): Promise<Uint8Array> {
    const url =
      `${environment.apiBaseUrl}/songs/${encodeURIComponent(songId)}/files/preset?sort_order=${sortOrder}`;
    // `authInterceptor` (app config) attaches the Bearer token.
    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
    return new Uint8Array(await blob.arrayBuffer());
  }
}
