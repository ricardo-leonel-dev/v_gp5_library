// F26 `library_first_startup` — the song detail page (`/songs/:id`).
// Loads the song via `GET /songs/:id`, renders cover + name + artist +
// the ordered list of presets (R31), with reference note (R34), back
// link (R42) and the four error states (R37-R41).

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SongsApi } from '../songs-api.service';
import { classifyLoadError } from '../library-load-error';
import { hasCoverFile, isBlank, orderedPresets, type SongDetail } from '../song';
import { SongCover } from '../song-cover/song-cover';

type DetailState = 'loading' | 'loaded' | 'not_found' | 'error' | 'session_expired';

@Component({
  selector: 'app-song-detail-page',
  imports: [TranslocoDirective, RouterLink, SongCover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './song-detail-page.html',
})
export class SongDetailPage {
  private readonly api = inject(SongsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly state = signal<DetailState>('loading');
  readonly song = signal<SongDetail | null>(null);
  readonly errorKey = signal<string | null>(null);

  // R31 — order presets by `sortOrder` ascending, regardless of the
  // response order.
  readonly presets = computed(() => orderedPresets(this.song()?.presets ?? []));
  // R35/R36 — request the cover only when `files` actually has a cover.
  readonly hasCover = computed(() => hasCoverFile(this.song()?.files ?? []));
  // R30 — hide the artist element when blank.
  readonly showArtist = computed(() => {
    const s = this.song();
    return s !== null && !isBlank(s.artist);
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null || id === '') {
      void this.router.navigate(['/songs']);
      return;
    }
    void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.state.set('loading');
    this.errorKey.set(null);
    try {
      const detail = await this.api.getSong(id);
      this.song.set(detail);
      this.state.set('loaded');
    } catch (err) {
      const kind = classifyLoadError(err);
      if (kind === 'not_found') {
        this.errorKey.set('songDetail.not_found');
        this.state.set('not_found');
        return;
      }
      if (kind === 'session_expired') {
        this.errorKey.set('songs.errors.session_expired');
        this.state.set('session_expired');
        return;
      }
      if (kind === 'unreachable') {
        this.errorKey.set('songs.errors.unreachable');
      } else {
        this.errorKey.set('songs.errors.load_failed');
      }
      this.state.set('error');
    }
  }

  // R40 — retry sends a fresh request.
  retry(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id !== null && id !== '') {
      void this.load(id);
    }
  }
}