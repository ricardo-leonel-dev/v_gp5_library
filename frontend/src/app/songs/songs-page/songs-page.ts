// F26 `library_first_startup` owns the full library page; this file is
// the F5 `import_preset_to_pedal` minimum it needs from the page:
//   * a `data-testid="song-card"` with a "Send to pedal" button
//     (data-testid="song-card-send-to-pedal", type="button") and a
//     click handler that snapshots `{ song, presets }` and opens the
//     dialog (R3, R4);
//   * the dialog is hosted as one `<app-write-to-pedal-dialog [song]
//     [presets]>` and the snapshot is cleared on `closed` (R61-style
//     cleanup; F26 will refetch the list afterwards);
//   * the button is hidden while the page is in `songs-loading` /
//     `songs-error` / `songs-session-expired` (R54);
//   * focus returns to the originating button when the dialog closes
//     (R32, F4 idiom: `queueMicrotask`).
//
// F5 also adds the `listSongs` call to `SongsApi` (F26 §2) so the page
// can be exercised end-to-end. F26 will keep both the call and the
// rendering, layering on covers, artist, IR/NAM tags, empty-state
// actions, retry/expired, etc.

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SongsApi } from '../songs-api.service';
import type { Song } from '../song';
import { WriteToPedalDialog } from '../write-to-pedal-dialog/write-to-pedal-dialog';
import type { WriteablePresetRef } from '../write-preset-form';

type LibraryState = 'loading' | 'loaded' | 'error' | 'session_expired' | 'empty';

@Component({
  selector: 'app-songs-page',
  imports: [TranslocoDirective, RouterLink, WriteToPedalDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './songs-page.html',
})
export class SongsPage {
  private readonly api = inject(SongsApi);

  readonly state = signal<LibraryState>('loading');
  readonly songs = signal<readonly Song[]>([]);
  readonly errorMessage = signal<string | null>(null);
  // Snapshot taken once per open; null while closed (R4, R61).
  readonly writeDialog = signal<{
    song: Song;
    presets: readonly WriteablePresetRef[];
  } | null>(null);

  // Every card's "Send to pedal" button; the one that opened the dialog
  // is picked by song id on close (focus return, design §5).
  private readonly sendButtons = viewChildren<ElementRef<HTMLButtonElement>>('sendButton');
  // Id of the song whose button opened the dialog; null while closed.
  private openedFromSongId: string | null = null;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    this.errorMessage.set(null);
    try {
      const list = await this.api.listSongs();
      this.songs.set(list);
      this.state.set(list.length === 0 ? 'empty' : 'loaded');
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 0) {
          this.errorMessage.set('songs.errors.unreachable');
          this.state.set('error');
          return;
        }
        if (err.status === 401) {
          this.errorMessage.set('songs.errors.session_expired');
          this.state.set('session_expired');
          return;
        }
      }
      this.errorMessage.set('songs.errors.load_failed');
      this.state.set('error');
    }
  }

  // R3 / R4 — open the dialog with a snapshot of (song, presets).
  openWriteDialog(song: Song): void {
    this.openedFromSongId = song.id;
    this.writeDialog.set({
      song,
      presets: song.presets.map((p, i) => ({
        songId: song.id,
        sortOrder: p.sortOrder,
        presetId: p.id,
        name: p.name,
        position: i + 1,
      })),
    });
  }

  // R32 — close returns focus to the button of the card that opened the
  // dialog (not just the first card's button).
  closeWriteDialog(): void {
    const songId = this.openedFromSongId;
    this.openedFromSongId = null;
    this.writeDialog.set(null);
    queueMicrotask(() => {
      const origin = this.sendButtons().find(
        (b) =>
          b.nativeElement.closest('[data-testid="song-card"]')?.getAttribute('data-song-id') ===
          songId,
      );
      origin?.nativeElement.focus();
    });
  }
}
