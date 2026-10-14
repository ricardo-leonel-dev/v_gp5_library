// F26 `library_first_startup` — the song detail page (`/songs/:id`).
// Loads the song via `GET /songs/:id`, renders cover + name + artist +
// the ordered list of presets (R31), with reference note (R34), back
// link (R42) and the four error states (R37-R41).
//
// F30 `view_song_preset_content` — each preset row toggles an inline
// read-only chain-board beneath the list. The chain board and block
// detail are the same components used by `/pedal/presets`, so the
// visual model matches exactly. No edit / duplicate / export / write
// affordances ship here — F27 owns those. The chain bytes are loaded
// once per expansion via `SongsApi.getSongPreset` and decoded with
// `decodePrstFile`.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { SongsApi } from '../songs-api.service';
import { classifyLoadError } from '../library-load-error';
import { hasCoverFile, isBlank, orderedPresets, type SongDetail } from '../song';
import { SongCover } from '../song-cover/song-cover';
import { ChainBoard, type ChainBlockClicked } from '../../pedals/chain-board/chain-board';
import { BlockDetail } from '../../pedals/block-detail/block-detail';
import type { PresetSlot } from '../../midi/preset';
import { decodePrstFile } from '../../midi/gp5-prst-file';

type DetailState = 'loading' | 'loaded' | 'not_found' | 'error' | 'session_expired';

type ChainStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'invalid';

interface ExpandedPreset {
  readonly sortOrder: number;
  readonly name: string;
  readonly chain: readonly PresetSlot[];
  readonly selectedBlock: ChainBlockClicked | null;
}

@Component({
  selector: 'app-song-detail-page',
  imports: [
    TranslocoDirective,
    RouterLink,
    SongCover,
    ChainBoard,
    BlockDetail,
  ],
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

  // F30 — which preset row is currently expanded (only one at a time).
  // `null` means every row is collapsed. Driving the expansion through a
  // single signal keeps the accordion contract obvious: clicking row X
  // sets `expandedSortOrder` to X and closes any other row.
  readonly expandedSortOrder = signal<number | null>(null);
  // F30 — per-row chain cache. Map keyed by `sortOrder`. Replaced (never
  // mutated) so the chain-board re-renders on refresh without re-fetch
  // dedup noise.
  private readonly chainBySortOrder = signal<ReadonlyMap<number, PresetSlot[]>>(new Map());
  // F30 — per-row chain load status. Exposed `readonly` so tests can
  // inspect the load lifecycle without going through the DOM.
  readonly chainStatusBySortOrder = signal<ReadonlyMap<number, ChainStatus>>(new Map());
  private readonly chainNameBySortOrder = signal<ReadonlyMap<number, string>>(new Map());
  // F30 — selected block (matching the `/pedal/presets` block-detail UX).
  // `null` hides the right-side panel.
  private readonly selectedBlockBySortOrder = signal<ReadonlyMap<number, ChainBlockClicked>>(new Map());
  // F30 — re-fetch nonce. Bumped on retry to force the chain re-load.
  private loadNonce = 0;

  // F30 — derived: the expanded row's ready-to-render state. Combining
  // the four per-row signals keeps the template terse.
  readonly expanded = computed<ExpandedPreset | null>(() => {
    const sortOrder = this.expandedSortOrder();
    if (sortOrder === null) return null;
    const status = this.chainStatusBySortOrder().get(sortOrder) ?? 'idle';
    if (status !== 'loaded') return null;
    const chain = this.chainBySortOrder().get(sortOrder) ?? [];
    const row = this.presets().find((p) => p.sortOrder === sortOrder);
    const name = this.chainNameBySortOrder().get(sortOrder) ?? row?.name ?? '';
    const selected = this.selectedBlockBySortOrder().get(sortOrder) ?? null;
    return { sortOrder, name, chain, selectedBlock: selected };
  });

  readonly expandedStatus = computed<ChainStatus>(() => {
    const sortOrder = this.expandedSortOrder();
    if (sortOrder === null) return 'idle';
    return this.chainStatusBySortOrder().get(sortOrder) ?? 'idle';
  });

  readonly chainHeadline = computed(() => {
    const e = this.expanded();
    if (e === null) return '';
    return `${e.sortOrder + 1} — ${e.name}`;
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id === null || id === '') {
      void this.router.navigate(['/songs']);
      return;
    }
    void this.load(id);

    // F30 — drive the per-row chain load off `expandedSortOrder` so the
    // async fetch lives inside the Angular zone the same way the song
    // fetch does (and so `fixture.whenStable` in tests reliably awaits
    // the microtask chain). Each transition to a new sortOrder restarts
    // the fetch: collapsed → null (no-op), open one row → load that
    // row, switch from row A to row B → load B without re-loading A.
    effect(() => {
      const sortOrder = this.expandedSortOrder();
      if (sortOrder === null) return;
      const status = this.chainStatusBySortOrder().get(sortOrder);
      const song = untracked(() => this.song());
      if (song === null) return;
      if (status === undefined || status === 'idle' || status === 'failed' || status === 'invalid') {
        const row = untracked(() => this.presets().find((p) => p.sortOrder === sortOrder));
        const rowName = row?.name ?? '';
        void this.loadPresetChain(sortOrder, rowName);
      }
    });
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

  // F30 — toggle the accordion row. Clicking the open row closes it;
  // clicking a different row replaces the open one. The actual fetch
  // happens in the constructor effect (R30) when `expandedSortOrder`
  // transitions to a new value.
  toggleRow(sortOrder: number, _rowName: string): void {
    if (this.expandedSortOrder() === sortOrder) {
      this.expandedSortOrder.set(null);
      return;
    }
    this.expandedSortOrder.set(sortOrder);
  }

  isExpanded(sortOrder: number): boolean {
    return this.expandedSortOrder() === sortOrder;
  }

  private async loadPresetChain(sortOrder: number, fallbackName: string): Promise<void> {
    const song = this.song();
    if (song === null) return;
    this.setChainStatus(sortOrder, 'loading');
    const nonce = ++this.loadNonce;
    try {
      const bytes = await this.api.getSongPreset(song.id, sortOrder);
      if (nonce !== this.loadNonce) return;
      const decoded = decodePrstFile(bytes);
      if (!decoded.ok) {
        this.setChainStatus(sortOrder, 'invalid');
        this.setChainName(sortOrder, fallbackName);
        return;
      }
      this.setChainStatus(sortOrder, 'loaded');
      this.setChainName(sortOrder, decoded.name || fallbackName);
      this.setChain(sortOrder, decoded.chain);
    } catch {
      if (nonce !== this.loadNonce) return;
      this.setChainStatus(sortOrder, 'failed');
      this.setChainName(sortOrder, fallbackName);
    }
  }

  // F30 — manual retry button (only meaningful when the previous fetch
  // failed or the bytes were corrupt). Bumps the nonce so an in-flight
  // late response cannot overwrite this row's state.
  retryChain(): void {
    const sortOrder = this.expandedSortOrder();
    if (sortOrder === null) return;
    const row = this.presets().find((p) => p.sortOrder === sortOrder);
    if (!row) return;
    void this.loadPresetChain(sortOrder, row.name);
  }

  // F30 — selected block per-row. Mirrors the `/pedal/presets` toggle:
  // clicking the same block twice closes the detail panel.
  onBlockClicked(sortOrder: number, click: ChainBlockClicked): void {
    this.selectedBlockBySortOrder.update((m) => {
      const next = new Map(m);
      if (click.slot === null) {
        next.delete(sortOrder);
        return next;
      }
      const prev = next.get(sortOrder);
      if (prev?.position === click.position) {
        next.delete(sortOrder);
      } else {
        next.set(sortOrder, click);
      }
      return next;
    });
  }

  selectedBlockFor(sortOrder: number): ChainBlockClicked | undefined {
    return this.selectedBlockBySortOrder().get(sortOrder);
  }

  private setChainStatus(sortOrder: number, status: ChainStatus): void {
    this.chainStatusBySortOrder.update((m) => {
      const next = new Map(m);
      next.set(sortOrder, status);
      return next;
    });
  }

  private setChainName(sortOrder: number, name: string): void {
    this.chainNameBySortOrder.update((m) => {
      const next = new Map(m);
      next.set(sortOrder, name);
      return next;
    });
  }

  private setChain(sortOrder: number, chain: readonly PresetSlot[]): void {
    this.chainBySortOrder.update((m) => {
      const next = new Map(m);
      next.set(sortOrder, [...chain]);
      return next;
    });
  }

  // F30 — translation key for the load-failure root cause. Kept here so
  // the template only walks the i18n namespace once.
  decodeErrorKey(): string {
    const sortOrder = this.expandedSortOrder();
    if (sortOrder === null) return 'songDetail.chain_load_failed';
    const status = this.chainStatusBySortOrder().get(sortOrder);
    if (status === 'invalid') return 'songDetail.chain_invalid';
    return 'songDetail.chain_load_failed';
  }
}
