// F36 `pedal_catalog_attach` — HTTP client for the four pedal-catalog
// endpoints. Same shape as `SongsApi`: `firstValueFrom`, `environment.
// apiBaseUrl`, `encodeURIComponent` on path ids. `authInterceptor` adds
// the Bearer token and clears the session on 401. The attach body sends
// `config: {}` verbatim — F38 `pedal_catalog_create` will replace it with
// the typed config shape.

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import type { AttachPedalBody, CatalogPedal, SongPedal } from './pedal-catalog';

@Injectable({ providedIn: 'root' })
export class PedalCatalogApi {
  private readonly http = inject(HttpClient);

  listPedals(): Promise<CatalogPedal[]> {
    return firstValueFrom(
      this.http.get<CatalogPedal[]>(`${environment.apiBaseUrl}/pedals`),
    );
  }

  listSongPedals(songId: string): Promise<SongPedal[]> {
    const url = `${environment.apiBaseUrl}/songs/${encodeURIComponent(songId)}/pedals`;
    return firstValueFrom(this.http.get<SongPedal[]>(url));
  }

  attachPedal(songId: string, pedalId: string, label: string): Promise<SongPedal> {
    const url = `${environment.apiBaseUrl}/songs/${encodeURIComponent(songId)}/pedals`;
    const body: AttachPedalBody = {
      pedal_catalog_id: pedalId,
      label,
      config: {},
    };
    return firstValueFrom(this.http.post<SongPedal>(url, body));
  }

  detachPedal(songId: string, songPedalId: string): Promise<void> {
    const url = `${environment.apiBaseUrl}/songs/${encodeURIComponent(songId)}/pedals/${encodeURIComponent(songPedalId)}`;
    return firstValueFrom(this.http.delete<void>(url));
  }
}