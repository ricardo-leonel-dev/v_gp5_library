// F36 `pedal_catalog_attach` — the per-song pedal list on
// `/songs/:id`. Lives in `src/app/pedal-catalog/` because the catalog
// domain (a player's owned physical pedals) is unrelated to the GP-5
// preset chain domain that already owns `src/app/pedals/`.
//
// The component:
//   - Requests `GET /songs/<id>/pedals` once on mount (R1, R2).
//   - Requests `GET /pedals` once on mount to power both the row name
//     lookup (R1 b-d) and the catalog selector (R3 a, R4).
//   - Renders rows in response order with a footswitch mark, the label,
//     and the catalog name (or `pedal_unavailable` when the catalog
//     loaded but the entry's `pedalCatalogId` no longer exists, or no
//     name when the catalog is pending / failed).
//   - Owns the attach panel (R3 b-e), its draft (R5), the POST (R6),
//     the 400/401/404/0/500 mapping (R7), the detach confirmation (R8),
//     the DELETE (R9), and the detach error mapping (R10).
//   - Never sends anything to `/pedals` other than GET (R11).
//   - Owns the i18n namespace `songPedals`; every user-visible string
//     comes from it (R13).

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { PedalCatalogApi } from '../pedal-catalog-api.service';
import type { CatalogPedal, SongPedal } from '../pedal-catalog';
import {
  classifyPedalLoadError,
  mapAttachError,
  mapDetachError,
  type AttachErrorKey,
  type DetachErrorKey,
  type PedalLoadError,
} from '../song-pedal-errors';
import { validateAttachDraft } from '../attach-draft';

type CatalogState =
  | 'loading'
  | 'loaded'
  | 'unreachable'
  | 'session_expired'
  | 'catalog_failed';

type AnnouncementKey = 'attached' | 'detached';

@Component({
  selector: 'app-song-pedals-section',
  imports: [TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './song-pedals-section.html',
})
export class SongPedalsSection {
  private readonly api = inject(PedalCatalogApi);
  private readonly injector = inject(Injector);

  readonly songId = input.required<string>();

  readonly listState = signal<'loading' | 'loaded' | PedalLoadError>('loading');
  readonly songPedals = signal<readonly SongPedal[]>([]);
  readonly catalogState = signal<CatalogState>('loading');
  readonly catalog = signal<readonly CatalogPedal[]>([]);
  readonly catalogById = computed<ReadonlyMap<string, CatalogPedal>>(() => {
    const m = new Map<string, CatalogPedal>();
    for (const p of this.catalog()) m.set(p.id, p);
    return m;
  });

  readonly panelOpen = signal<boolean>(false);
  readonly selectedPedalId = signal<string | null>(null);
  readonly label = signal<string>('');
  readonly labelTouched = signal<boolean>(false);
  readonly draft = computed(() =>
    validateAttachDraft(this.selectedPedalId(), this.label()),
  );
  // The field-level error: always `label_too_long`; `label_required` only
  // when the user has blurred an empty label, or when a 400 with that
  // body just arrived (R7 a). The 400 case is tracked in `restLabelError`
  // so the field error sticks even when the label value is still valid.
  private readonly restLabelError = signal<'label_required' | null>(null);
  readonly labelError = computed<
    'label_required' | 'label_too_long' | null
  >(() => {
    const draft = this.draft();
    if (!draft.valid && draft.error === 'label_too_long') {
      return 'label_too_long';
    }
    if (
      !draft.valid &&
      draft.error === 'label_required' &&
      this.labelTouched()
    ) {
      return 'label_required';
    }
    if (this.restLabelError() === 'label_required') {
      return 'label_required';
    }
    return null;
  });

  readonly attaching = signal<boolean>(false);
  readonly attachError = signal<AttachErrorKey | null>(null);

  readonly confirmingId = signal<string | null>(null);
  readonly detachingId = signal<string | null>(null);
  readonly detachError = signal<DetachErrorKey | null>(null);

  readonly announcement = signal<AnnouncementKey | null>(null);

  private readonly keepButtonRefs = viewChildren<ElementRef<HTMLButtonElement>>(
    'keepBtn',
  );
  private readonly openPanelButton =
    viewChild<ElementRef<HTMLButtonElement>>('openPanelBtn');
  private readonly detachButtonRefs = viewChildren<ElementRef<HTMLButtonElement>>(
    'detachBtn',
  );

  constructor() {
    // R3 a — exactly one of each request per `songId` change. The page
    // only mounts this component for a `loaded` song, so `songId`
    // effectively does not change in practice; keying on it keeps the
    // contract honest.
    effect(() => {
      const songId = this.songId();
      this.listState.set('loading');
      this.catalogState.set('loading');
      this.songPedals.set([]);
      this.catalog.set([]);
      this.attachError.set(null);
      this.detachError.set(null);
      this.confirmingId.set(null);
      this.detachingId.set(null);
      this.announcement.set(null);
      this.restLabelError.set(null);
      this.labelTouched.set(false);
      this.label.set('');
      this.selectedPedalId.set(null);
      this.panelOpen.set(false);
      void this.loadSongPedals(songId);
      void this.loadCatalog();
    });
  }

  private async loadSongPedals(songId: string): Promise<void> {
    try {
      const list = await this.api.listSongPedals(songId);
      this.songPedals.set(list);
      this.listState.set('loaded');
    } catch (err) {
      this.listState.set(classifyPedalLoadError(err));
    }
  }

  private async loadCatalog(): Promise<void> {
    try {
      const list = await this.api.listPedals();
      this.catalog.set(list);
      this.catalogState.set('loaded');
    } catch (err) {
      const kind = classifyPedalLoadError(err);
      // GET /pedals has no 404 contract in practice; collapse `load_failed`
      // and `song_not_found` into `catalog_failed` per design §4.2.
      if (kind === 'unreachable') {
        this.catalogState.set('unreachable');
      } else if (kind === 'session_expired') {
        this.catalogState.set('session_expired');
      } else {
        this.catalogState.set('catalog_failed');
      }
    }
  }

  togglePanel(): void {
    if (this.panelOpen()) {
      this.cancelPanel();
      return;
    }
    this.panelOpen.set(true);
    this.attachError.set(null);
    this.restLabelError.set(null);
    this.label.set('');
    this.labelTouched.set(false);
    this.selectedPedalId.set(null);
  }

  cancelPanel(): void {
    this.closePanel();
  }

  // R3 e — closing the panel (Cancel, toggle, 201) returns focus to the
  // Attach pedal button, which stays rendered with aria-expanded.
  private closePanel(): void {
    this.panelOpen.set(false);
    this.attachError.set(null);
    this.restLabelError.set(null);
    this.label.set('');
    this.labelTouched.set(false);
    this.selectedPedalId.set(null);
    afterNextRender(() => this.openPanelButton()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  onPedalSelected(id: string): void {
    if (this.selectedPedalId() === id) {
      this.selectedPedalId.set(null);
    } else {
      this.selectedPedalId.set(id);
    }
    this.attachError.set(null);
  }

  onLabelInput(value: string): void {
    this.label.set(value);
    if (this.attachError() !== null) this.attachError.set(null);
    if (this.restLabelError() !== null) this.restLabelError.set(null);
  }

  onLabelBlur(): void {
    this.labelTouched.set(true);
  }

  // R5 a — the hint is shown whenever no pedal is selected.
  showPedalHint(): boolean {
    return this.selectedPedalId() === null;
  }

  // R1 b-d — name lookup. `null` means: catalog is pending/failed
  // (R1 d) or the entry's pedalCatalogId is missing from a loaded
  // catalog (R1 c). The template decides between "no name" and
  // `pedal_unavailable` based on `catalogState`.
  pedalName(entry: SongPedal): string | null {
    if (this.catalogState() !== 'loaded') return null;
    return this.catalogById().get(entry.pedalCatalogId)?.name ?? null;
  }

  attachDisabled(): boolean {
    return this.attaching() || !this.draft().valid;
  }

  catalogIsEmpty(): boolean {
    return this.catalogState() === 'loaded' && this.catalog().length === 0;
  }

  attachLabel(): string {
    return this.attaching() ? 'songPedals.attaching' : 'songPedals.attach';
  }

  labelCounterCount(): number {
    const trimmed = this.label().trim();
    return trimmed.length === 0 ? 0 : [...trimmed].length;
  }

  retryList(): void {
    const songId = this.songId();
    this.listState.set('loading');
    void this.loadSongPedals(songId);
  }

  retryCatalog(): void {
    this.catalogState.set('loading');
    void this.loadCatalog();
  }

  async attach(): Promise<void> {
    if (this.attaching()) return;
    const draft = this.draft();
    if (!draft.valid) return;
    const songId = this.songId();
    this.attaching.set(true);
    this.attachError.set(null);
    try {
      const created = await this.api.attachPedal(
        songId,
        draft.pedalId,
        draft.label,
      );
      // Newest first — prepend so a manual reload matches.
      this.songPedals.set([created, ...this.songPedals()]);
      this.listState.set('loaded');
      this.closePanel();
      this.detachError.set(null);
      this.announcement.set('attached');
    } catch (err) {
      const key = mapAttachError(err);
      this.attachError.set(key);
      if (key === 'label_required') {
        this.labelTouched.set(true);
        this.restLabelError.set('label_required');
      } else if (key === 'pedal_gone') {
        this.selectedPedalId.set(null);
        // R7 b — one fresh GET /pedals so the selector reflects the
        // current catalog without the stale selection.
        this.catalogState.set('loading');
        void this.loadCatalog();
      }
    } finally {
      this.attaching.set(false);
    }
  }

  // R8 a-d — detach confirmation. One row at a time: opening another
  // row's confirmation replaces the existing one. Focus moves to Keep
  // after the render. No-op while a detach is pending (its `finally`
  // would otherwise close the newly opened confirmation).
  askDetach(id: string): void {
    if (this.detachingId() !== null) return;
    this.confirmingId.set(id);
    this.detachError.set(null);
    afterNextRender(() => {
      const refs = this.keepButtonRefs();
      for (const r of refs) {
        const button = r.nativeElement;
        if (button.dataset['songPedalId'] === id) {
          button.focus();
          return;
        }
      }
    }, { injector: this.injector });
  }

  cancelDetach(id: string): void {
    if (this.confirmingId() !== id) return;
    this.confirmingId.set(null);
    afterNextRender(() => {
      const refs = this.detachButtonRefs();
      for (const r of refs) {
        const button = r.nativeElement;
        if (button.dataset['songPedalId'] === id) {
          button.focus();
          return;
        }
      }
    }, { injector: this.injector });
  }

  // R8 c — Escape on a row's confirmation container cancels it.
  onDetachKeydown(ev: KeyboardEvent, id: string): void {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancelDetach(id);
    }
  }

  // R9 a-e — confirm detach. Returns early while another detach is
  // pending; on 204 removes the row locally and announces it; on 404
  // removes the row (R10 a); on other errors keeps the row and shows
  // the mapped message.
  async confirmDetach(id: string): Promise<void> {
    if (this.detachingId() !== null) return;
    if (this.confirmingId() !== id) return;
    const songId = this.songId();
    this.detachingId.set(id);
    this.detachError.set(null);
    try {
      await this.api.detachPedal(songId, id);
      this.songPedals.set(this.songPedals().filter((p) => p.id !== id));
      this.detachError.set(null);
      this.attachError.set(null);
      this.announcement.set('detached');
      this.listState.set('loaded');
    } catch (err) {
      const key = mapDetachError(err);
      if (key === 'already_detached') {
        // R10 a — row is gone on the server too; drop it locally.
        this.songPedals.set(this.songPedals().filter((p) => p.id !== id));
        this.listState.set('loaded');
      }
      this.detachError.set(key);
    } finally {
      this.confirmingId.set(null);
      this.detachingId.set(null);
    }
  }

  isRowConfirming(id: string): boolean {
    return this.confirmingId() === id;
  }

  isRowDetaching(id: string): boolean {
    return this.detachingId() === id;
  }

  ariaExpandedAttach(): string {
    return this.panelOpen() ? 'true' : 'false';
  }
}