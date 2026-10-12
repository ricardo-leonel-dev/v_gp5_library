// F26 `library_first_startup` owns the full library page. F5
// (`import_preset_to_pedal`) shipped the minimum it needs:
//   * a `data-testid="song-card"` with a "Send to pedal" button
//     (data-testid="song-card-send-to-pedal", type="button") and a
//     click handler that snapshots `{ song, presets }` and opens the
//     dialog (R3, R4);
//   * the dialog is hosted as one `<app-write-to-pedal-dialog [song]
//     [presets]>` and the snapshot is cleared on `closed`;
//   * focus returns to the originating button when the dialog closes.
//
// F26 extends the page on top of that, without rewriting anything:
// covers, name link (`song-card-link`, R25/R75-R78), artist, preset
// count, the empty-state CTA, `songs-new`, `songs-retry` inside
// `songs-error-message`, and the "New song" dialog bound to a snapshot
// from `PedalPresetsStore.savableSnapshot()` (R60-R73). The card stays
// an `<li>` with `data-song-id`; the F5 send button stays a sibling of
// the link (not inside it).

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SongsApi } from '../songs-api.service';
import { classifyLoadError } from '../library-load-error';
import { coverHintForListSong, isBlank, orderedPresets, type Song } from '../song';
import { WriteToPedalDialog } from '../write-to-pedal-dialog/write-to-pedal-dialog';
import type { WriteablePresetRef } from '../write-preset-form';
import { SaveSongDialog } from '../save-song-dialog/save-song-dialog';
import { SongCover } from '../song-cover/song-cover';
import { PedalPresetsStore } from '../../pedals/pedal-presets.store';
import { PedalConnectFlow } from '../../pedals/pedal-connect-flow.service';

type LibraryState = 'loading' | 'loaded' | 'error' | 'session_expired' | 'empty';

@Component({
  selector: 'app-songs-page',
  imports: [
    TranslocoDirective,
    RouterLink,
    WriteToPedalDialog,
    SaveSongDialog,
    SongCover,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './songs-page.html',
})
export class SongsPage {
  private readonly api = inject(SongsApi);
  private readonly pedalPresets = inject(PedalPresetsStore);
  private readonly connectFlow = inject(PedalConnectFlow);
  private readonly router = inject(Router);

  readonly state = signal<LibraryState>('loading');
  readonly songs = signal<readonly Song[]>([]);
  readonly errorMessage = signal<string | null>(null);
  // Snapshot taken once per open; null while closed (R4, R61).
  readonly writeDialog = signal<{
    song: Song;
    presets: readonly WriteablePresetRef[];
  } | null>(null);
  // Snapshot of the F4 "Save song" dialog (R60, R68, R74). Cleared on
  // `closed`. R71: bound to the same array instances opened with.
  readonly newSong = signal<{
    initial: readonly import('../../midi/preset').Preset[];
    available: readonly import('../../midi/preset').Preset[];
  } | null>(null);

  // F26 template accessors (R7, R8, R10, R13, R25).
  readonly coverHint = coverHintForListSong;
  readonly isBlank = isBlank;

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
      // F26 R20-R24, R79. `classifyLoadError` is the shared error mapper;
      // the library page treats `not_found` as `load_failed` (R21) since
      // `GET /songs` never returns 404.
      const kind = classifyLoadError(err);
      if (kind === 'unreachable') {
        this.errorMessage.set('songs.errors.unreachable');
        this.state.set('error');
      } else if (kind === 'session_expired') {
        this.errorMessage.set('songs.errors.session_expired');
        this.state.set('session_expired');
      } else {
        this.errorMessage.set('songs.errors.load_failed');
        this.state.set('error');
      }
    }
  }

  // R3 / R4 — open the dialog with a snapshot of (song, presets).
  // R80 — order by `sortOrder` so positions 1..N are deterministic even
  // if the list response order ever changes.
  openWriteDialog(song: Song): void {
    this.openedFromSongId = song.id;
    const ordered = orderedPresets(song.presets);
    this.writeDialog.set({
      song,
      presets: ordered.map((p, i) => ({
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

  // R59, R60, R68, R74. Open the F4 "New song" dialog with a snapshot
  // of the pedal's current savable presets (R68) or `[]` (R60). The
  // page never passes mock presets (R69): `savableSnapshot()` filters
  // on `raw` and reads only the real `PedalPresetsStore`.
  openNewSong(): void {
    const available = this.pedalPresets.savableSnapshot();
    this.newSong.set({ initial: [], available });
  }

  // R61 — clear the snapshot and reload the list. F4 dialog emits `closed`
  // on cancel and on success, so a single reload covers both.
  closeNewSong(): void {
    this.newSong.set(null);
    void this.load();
  }

  // R12 — empty-state CTA. The header button is the same flow, but
  // the empty state has its own button so users without a single song
  // don't need to scroll up to act.
  startConnect(): void {
    void this.connectFlow.start();
  }

  // R23 — the retry button on the error state.
  retry(): void {
    void this.load();
  }

  // R25 / R75 — the song-card-link navigates to /songs/<id>. The
  // `RouterLink` directive on the `<a>` already handles the click via
  // Angular's router; this method exists so templates that bind to it
  // (e.g. inside the `<a>` for keyboard activation) work uniformly.
  goToSong(song: Song): void {
    void this.router.navigate(['/songs', song.id]);
  }
}