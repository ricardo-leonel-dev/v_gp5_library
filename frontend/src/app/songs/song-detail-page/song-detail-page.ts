// F26 `library_first_startup` — the song detail page (`/songs/:id`).
// Loads the song via `GET /songs/:id`, renders cover + name + artist +
// the ordered list of presets (R31), with reference note (R34), back
// link (R42) and the four error states (R37-R41).
//
// F30 `view_song_preset_content` — each preset row toggles an inline
// read-only chain-board beneath the list. The chain board and block
// detail are the same components used by `/pedal/presets`, so the
// visual model matches exactly.
//
// F27 `song_preset_duplicate_edit_export` — adds the "Duplicate" button
// to each source row, the in-memory draft panel (name input, editable
// chain board + block detail, action bar with Export / Send to pedal /
// Discard), and the leave-confirmation guard. Drafts never send a
// network request; the page's only F27 writes are `getSongPreset`
// (when a duplicate is requested) and `downloadBytes` (browser-only).

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
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
import { hasCoverFile, isBlank, orderedPresets, type SongDetail, type SongFile, type FormattedByteSize, formatByteSize, userFiles, extraConfigEntries, type ExtraConfigEntry } from '../song';
import { SongCover } from '../song-cover/song-cover';
import { ChainBoard, type ChainBlockClicked } from '../../pedals/chain-board/chain-board';
import { BlockDetail } from '../../pedals/block-detail/block-detail';
import type { PresetSlot } from '../../midi/preset';
import { decodePrstFile } from '../../midi/gp5-prst-file';
import { WriteToPedalDialog, type LocalDraftPreset } from '../write-to-pedal-dialog/write-to-pedal-dialog';
import { LeaveDraftDialog } from '../leave-draft-dialog/leave-draft-dialog';
import { downloadBytes } from '../download-bytes';
import {
  createDraft,
  draftToPreset,
  draftToPrst,
  exportFileName,
  renameDraft,
  setBlockEnabled,
  setBlockModule,
  setBlockParameter,
  validateDraftName,
  type PresetDraft,
} from '../preset-draft';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import type { WriteablePresetRef } from '../write-preset-form';

type DetailState = 'loading' | 'loaded' | 'not_found' | 'error' | 'session_expired';

type ChainStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'invalid';

type DraftStatus = 'idle' | 'creating' | 'ready' | 'failed';

interface ExpandedPreset {
  readonly sortOrder: number;
  readonly name: string;
  readonly chain: readonly PresetSlot[];
  readonly selectedBlock: ChainBlockClicked | null;
}

interface DuplicateError {
  readonly sortOrder: number;
  readonly key: string;
}

@Component({
  selector: 'app-song-detail-page',
  imports: [
    TranslocoDirective,
    RouterLink,
    SongCover,
    ChainBoard,
    BlockDetail,
    WriteToPedalDialog,
    LeaveDraftDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './song-detail-page.html',
})
export class SongDetailPage {
  private readonly api = inject(SongsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pedal = inject(WebMidiPedalConnection);

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
  // F33 R2-R4, R13 — IR/NAM files in display order, cover dropped.
  readonly userFiles = computed<readonly SongFile[]>(() => userFiles(this.song()?.files ?? []));
  // F33 R15-R20 — extraConfig pairs in response order.
  readonly extraEntries = computed<readonly ExtraConfigEntry[]>(() =>
    extraConfigEntries(this.song()?.extraConfig),
  );

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

  // F27 R10 — in-memory draft, `null` when no draft exists (R13).
  readonly draft = signal<PresetDraft | null>(null);
  // F27 R13 — the page holds at most one draft.
  readonly canDuplicate = computed(() => this.draft() === null);
  // F27 R11 — song names for the validation table (source names + draft name).
  readonly songNames = computed<readonly string[]>(() => {
    const s = this.song();
    if (!s) return [];
    return s.presets.map((p) => p.name);
  });
  // F27 R25-R27 — the draft name's validation error, or `null`.
  readonly draftNameError = computed(() => {
    const d = this.draft();
    if (!d) return null;
    const names = this.songNames().filter((n) => n !== d.sourceName);
    return validateDraftName(d.name, names);
  });
  // F27 R28 — actions are disabled while the draft name has an error.
  readonly draftActionsEnabled = computed(() => this.draftNameError() === null);
  // F27 R16 — selected block on the draft's chain board.
  readonly draftSelectedPos = signal<number | null>(null);

  // F27 R11 — duplicate creation lifecycle per row.
  private readonly duplicateStatusBySortOrder = signal<ReadonlyMap<number, DraftStatus>>(new Map());
  readonly duplicateErrorBySortOrder = signal<ReadonlyMap<number, DuplicateError>>(new Map());

  // F27 R39 — write-to-pedal dialog state.
  readonly writeDialogOpen = signal<boolean>(false);

  // F27 R48-R55 — leave confirmation.
  readonly leavePrompt = signal<{ resolve: (leave: boolean) => void } | null>(null);
  readonly hasUnsavedDraft = computed(() => this.draft()?.edited === true);

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

  // F27 R39 — the dialog's localPreset input built from the draft.
  readonly writeDialogLocalPreset = computed<LocalDraftPreset | null>(() => {
    if (!this.writeDialogOpen()) return null;
    const d = this.draft();
    if (!d) return null;
    return {
      name: d.name.trim(),
      toPreset: (slot: number) => draftToPreset(d, slot),
    };
  });

  // F27 R39 — the dialog still needs `presets` (a non-empty list is
  // required by the input signature); the dialog uses this list for its
  // display when in draft mode, but the visible list collapses to the
  // single draft row.
  readonly writeDialogPresets = computed<readonly WriteablePresetRef[]>(() => {
    const song = this.song();
    if (!song) return [];
    return song.presets.map((p, i) => ({
      songId: song.id,
      sortOrder: p.sortOrder,
      presetId: p.id,
      name: p.name,
      position: i + 1,
    }));
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

  // F27 — selected block on the draft board.
  onDraftBlockClicked(click: ChainBlockClicked): void {
    if (click.slot === null) {
      this.draftSelectedPos.set(null);
      return;
    }
    const prev = this.draftSelectedPos();
    if (prev === click.position) {
      this.draftSelectedPos.set(null);
    } else {
      this.draftSelectedPos.set(click.position);
    }
  }

  // F27 R9, R10, R12, R13 — Duplicate handler. Fetches the source
  // bytes, builds a draft, and pins it as the page's only draft.
  async onDuplicate(sortOrder: number): Promise<void> {
    if (!this.canDuplicate()) return;
    const song = this.song();
    if (!song) return;
    this.setDuplicateStatus(sortOrder, 'creating');
    this.clearDuplicateError(sortOrder);
    try {
      const bytes = await this.api.getSongPreset(song.id, sortOrder);
      const res = createDraft(sortOrder, bytes, this.songNames());
      if (!res.ok) {
        this.setDuplicateStatus(sortOrder, 'failed');
        this.setDuplicateError(sortOrder, { sortOrder, key: 'songPresetDraft.errors.duplicate_failed' });
        return;
      }
      this.draft.set(res.draft);
      this.draftSelectedPos.set(null);
      this.expandedSortOrder.set(null);
      this.setDuplicateStatus(sortOrder, 'ready');
    } catch {
      this.setDuplicateStatus(sortOrder, 'failed');
      this.setDuplicateError(sortOrder, { sortOrder, key: 'songPresetDraft.errors.duplicate_failed' });
    }
  }

  // F27 R25-R27 — name input.
  onDraftNameInput(value: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set(renameDraft(d, value));
  }

  // F27 R17 — bypass switch.
  onDraftBypassChange(pos: number, enabled: boolean): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set(setBlockEnabled(d, pos, enabled));
  }

  // F27 R19, R20 — parameter input. Keep the previous value when the
  // typed text is empty / non-finite.
  onDraftParameterChange(
    pos: number,
    payload: { key: string; value: number; raw: string },
  ): void {
    const d = this.draft();
    if (!d) return;
    if (!Number.isFinite(payload.value)) return;
    this.draft.set(setBlockParameter(d, pos, payload.key, payload.value));
  }

  // F27 R22 — moduleType swap.
  onDraftModuleChange(pos: number, moduleType: string): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set(setBlockModule(d, pos, moduleType));
  }

  // F27 R37, R38 — Export .prst: build the bytes, download. No network.
  onDraftExport(): void {
    const d = this.draft();
    if (!d) return;
    const prst = draftToPrst(d);
    const filename = exportFileName(d.name);
    downloadBytes(prst, filename);
  }

  // F27 R39, R40, R41, R42 — Send to pedal: open the dialog in draft
  // mode. The dialog's own guard keeps Send disabled while the pedal is
  // not connected.
  onDraftSendToPedal(): void {
    if (!this.draftActionsEnabled()) return;
    this.writeDialogOpen.set(true);
  }

  onWriteDialogClosed(): void {
    this.writeDialogOpen.set(false);
  }

  // F27 R43 — Discard the draft.
  onDraftDiscard(): void {
    this.draft.set(null);
    this.draftSelectedPos.set(null);
  }

  // F27 R48-R55 — leave confirmation. Synchronously allows navigation
  // when there's no draft or the draft has no edits (R53, R54). With an
  // edited draft, holds the navigation and returns a Promise that the
  // leave dialog resolves.
  confirmLeave(): boolean | Promise<boolean> {
    if (!this.hasUnsavedDraft()) return true;
    return new Promise<boolean>((resolve) => {
      this.leavePrompt.set({ resolve });
    });
  }

  // F27 R49 — Leave and discard.
  onLeaveAndDiscard(): void {
    const prompt = this.leavePrompt();
    if (!prompt) return;
    this.draft.set(null);
    this.draftSelectedPos.set(null);
    this.leavePrompt.set(null);
    prompt.resolve(true);
  }

  // F27 R50 — Keep editing (also Escape / backdrop).
  onLeaveKeep(): void {
    const prompt = this.leavePrompt();
    if (!prompt) return;
    this.leavePrompt.set(null);
    prompt.resolve(false);
  }

  // F27 R52, R54 — beforeunload only fires preventDefault when the
  // draft has unsaved edits.
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedDraft()) {
      event.preventDefault();
      // Older engines need a return value to show their own prompt.
      event.returnValue = '';
    }
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

  duplicateErrorFor(sortOrder: number): DuplicateError | null {
    return this.duplicateErrorBySortOrder().get(sortOrder) ?? null;
  }

  // F33 R8, R12 — file size keyed for Transloco and locale-formatted.
  fileSize(bytes: number, lang: string): FormattedByteSize {
    return formatByteSize(bytes, lang);
  }

  duplicateStatusFor(sortOrder: number): DraftStatus {
    return this.duplicateStatusBySortOrder().get(sortOrder) ?? 'idle';
  }

  // F27 R18 — chain board uses the same `opacity-40` dimming as the
  // rest of the app. The board already reads `enabled` from each
  // PresetSlot via the `chain()` signal.
  draftChainForBoard(): readonly PresetSlot[] {
    return this.draft()?.chain ?? [];
  }

  // F27 R37 — has the draft been edited since creation?
  draftIsEdited(): boolean {
    return this.draft()?.edited === true;
  }

  // F27 R11 — the draft panel only opens after `getSongPreset`
  // resolves successfully; the pedalConnectOnly guard is implicit in
  // the dialog.
  draftNameForInput(): string {
    return this.draft()?.name ?? '';
  }

  // F27 R28 — source rows keep their read-only chain board. Reused
  // directly from `chainBySortOrder` so F30 keeps working.
  draftAsPresetForBoard(): readonly PresetSlot[] {
    return this.draftChainForBoard();
  }

  draftSelectedSlot(): PresetSlot | null {
    const pos = this.draftSelectedPos();
    if (pos === null) return null;
    return this.draft()?.chain[pos] ?? null;
  }

  // F27 R17 / R18 — bypass switch state for a chain position.
  blockEnabled(pos: number): boolean {
    return this.draft()?.chain[pos]?.enabled ?? false;
  }

  // F27 — the draft card's source name (for the heading copy).
  draftSourceName(): string {
    return this.draft()?.sourceName ?? '';
  }

  // F27 R13 — hide Duplicate buttons while a draft is open.
  isDuplicateDisabled(): boolean {
    return !this.canDuplicate();
  }

  // F27 R29 — unsaved chip is shown while the draft has edits.
  isDraftUnsaved(): boolean {
    return this.draftIsEdited();
  }

  // The pedal is referenced so its connection state is reactive even
  // though the dialog manages the connection reminder itself.
  readonly connectionState = this.pedal.connectionState;

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

  private setDuplicateStatus(sortOrder: number, status: DraftStatus): void {
    this.duplicateStatusBySortOrder.update((m) => {
      const next = new Map(m);
      next.set(sortOrder, status);
      return next;
    });
  }

  private setDuplicateError(sortOrder: number, err: DuplicateError): void {
    this.duplicateErrorBySortOrder.update((m) => {
      const next = new Map(m);
      next.set(sortOrder, err);
      return next;
    });
  }

  private clearDuplicateError(sortOrder: number): void {
    this.duplicateErrorBySortOrder.update((m) => {
      if (!m.has(sortOrder)) return m;
      const next = new Map(m);
      next.delete(sortOrder);
      return next;
    });
  }
}
