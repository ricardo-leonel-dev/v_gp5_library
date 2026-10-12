// F26 `library_first_startup` — per-song cover tile. One cover image
// per song; requests the cover blob, frames it inside the card's tile
// (library) or hero (detail) area, and shows an in-house guitar-pick
// placeholder while pending / 404 / any error.
//
// Three states worth distinguishing:
//   * `loading` — the request is in flight (R14).
//   * `loaded`  — a 200 arrived; the image renders the object URL (R15).
//   * `none`    — a 404 arrived (R36 — detail), or 404 on the list page
//     meaning the song has no cover (R16).
//   * `error`   — any other failure; placeholder stays, list intact (R17,
//     R18).
//
// Object URLs are revoked on destroy (R19). The component owns its own
// URL lifecycle: pages don't track them, so destroying a page destroys
// all its covers' URLs through Angular's `DestroyRef`.

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { SongsApi } from '../songs-api.service';

type CoverState = 'loading' | 'loaded' | 'none' | 'error';

@Component({
  selector: 'app-song-cover',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './song-cover.html',
})
export class SongCover {
  private readonly api = inject(SongsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly songId = input.required<string>();
  readonly songName = input.required<string>();
  // Library list DTO has no cover indicator yet (design §4), so the
  // page passes `undefined` to mean "we don't know; request and treat
  // 404 as none". Detail passes `true` (R35) or `false` (R36) — explicit
  // cover absence skips the network roundtrip entirely.
  readonly hasCover = input<boolean | undefined>(undefined);
  readonly size = input<'tile' | 'hero'>('tile');

  readonly state = signal<CoverState>('loading');
  readonly url = signal<string | null>(null);

  // Pulse animation follows the design Visual direction: always paired
  // with `motion-reduce:animate-none`. Lives on the cover element while
  // loading; on `none` / `error` the placeholder takes over.
  readonly isLoading = computed(() => this.state() === 'loading');

  private revoked = false;

  constructor() {
    // Exactly one request per instance (R13, R35). Reads inputs through
    // signals so an `effect` re-fires when the page re-binds the same
    // component to a different id (e.g. the `*ngFor` reuse path with
    // `track id` — the list page uses `track song.id`, so each id maps
    // to a unique component instance; this effect covers the detail
    // page re-use case where the user navigates between songs without
    // the component being torn down).
    effect(() => {
      void this.fetchCover();
    });

    this.destroyRef.onDestroy(() => {
      this.revoked = true;
      const u = this.url();
      if (u !== null) URL.revokeObjectURL(u);
    });
  }

  private async fetchCover(): Promise<void> {
    const id = this.songId();
    const known = this.hasCover();
    // R36 — detail page passes `false` when `files` has no cover row;
    // no request, placeholder immediately.
    if (known === false) {
      this.state.set('none');
      return;
    }
    this.state.set('loading');
    this.url.set(null);
    try {
      const blob = await this.api.getCover(id);
      if (this.revoked) {
        // Page destroyed while in flight — revoke whatever blob created.
        // (`URL.createObjectURL` is global; calling it twice would leak.)
        const throwawayUrl = URL.createObjectURL(blob);
        URL.revokeObjectURL(throwawayUrl);
        return;
      }
      const objUrl = URL.createObjectURL(blob);
      if (this.revoked) {
        URL.revokeObjectURL(objUrl);
        return;
      }
      this.url.set(objUrl);
      this.state.set('loaded');
    } catch (err) {
      // Status 0 → unreachable, 404 → none (R16), any other → error.
      // We can't import HttpErrorResponse here without coupling this
      // component to the API shape — the API surfaces the response via
      // a typed error path. Inspect the status field if present, else
      // default to error.
      if (this.revoked) return;
      const status = (err as { status?: number } | null | undefined)?.status;
      if (status === 404) {
        this.state.set('none');
      } else if (status === 0) {
        this.state.set('error');
      } else {
        this.state.set('error');
      }
    }
  }
}