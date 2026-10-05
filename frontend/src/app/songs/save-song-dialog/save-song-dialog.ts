// F4 `save_preset_dialog` — the dialog itself. Inputs are snapshots from the
// host page (R26); every value, mode, and available list is fixed at open
// time. Pure form logic lives in `save-song-form.ts`. Network calls live in
// `SongsApi` / `PlanApi`. The dialog never touches `PedalConnection`.

import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Preset } from '../../midi/preset';
import type { CreatedSong } from '../song';
import { SongsApi } from '../songs-api.service';
import { PlanApi } from '../plan-api.service';
import type { PlanLimits } from '../plan-limits';
import {
  SONG_TEXT_MAX,
  EXTRA_CONFIG_MAX_BYTES,
  FILE_NAME_MAX,
  addablePresets,
  atPresetCap,
  buildSongFormData,
  checkPickedFile,
  checkPrstPick,
  detectUserSlots,
  fileEntry,
  moveEntry,
  pedalEntry,
  pruneAttachments,
  tryAppendEntry,
  validateSaveSongDraft,
  type ExtraConfigRow,
  type SaveSongDraft,
  type SaveSongErrors,
  type SongPresetEntry,
} from '../save-song-form';
import { decodePrstFile } from '../../midi/gp5-prst-file';
import { mapSaveSongError } from '../save-song-errors';
import { ChainStrip } from '../../pedals/chain-strip/chain-strip';

let nextExtraId = 1;

@Component({
  selector: 'app-save-song-dialog',
  imports: [TranslocoDirective, FormsModule, RouterLink, ChainStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './save-song-dialog.html',
})
export class SaveSongDialog {
  readonly initialPresets = input.required<readonly Preset[]>();
  readonly availablePresets = input.required<readonly Preset[]>();
  readonly testMode = input(false);
  readonly closed = output<void>();

  private readonly songsApi = inject(SongsApi);
  private readonly planApi = inject(PlanApi);

  readonly entries = signal<readonly SongPresetEntry[]>([]);
  readonly addable = computed(() =>
    addablePresets(this.availablePresets(), this.entries()),
  );
  readonly userSlots = computed(() => detectUserSlots(this.entries()));
  readonly plan = signal<PlanLimits | null>(null);
  readonly atCap = computed(() =>
    atPresetCap(this.entries().length, this.plan()?.presetsPerSongLimit ?? null),
  );
  readonly songLimitReached = computed(() => {
    const p = this.plan();
    return p !== null && p.songLimit !== null && p.songCount >= p.songLimit;
  });

  readonly addError = signal<{ key: string; params?: Record<string, string> } | null>(null);
  readonly name = signal('');
  readonly artist = signal('');
  readonly cover = signal<File | null>(null);
  readonly extraRows = signal<readonly ExtraConfigRow[]>([]);
  readonly attachments = signal<ReadonlyMap<string, File>>(new Map());
  readonly fieldErrors = signal<SaveSongErrors>({ entryRows: {}, extraRows: {}, attachments: {} });
  readonly serverError = signal<ReturnType<typeof mapSaveSongError> | null>(null);
  readonly submitting = signal(false);
  readonly saved = signal<CreatedSong | null>(null);
  readonly testModeNoticeShown = signal(false);

  readonly SONG_TEXT_MAX = SONG_TEXT_MAX;
  readonly FILE_NAME_MAX = FILE_NAME_MAX;

  // Stable id for aria-labelledby / autofocus lookup.
  readonly titleId = `save-song-title-${Math.random().toString(36).slice(2, 10)}`;

  private fileCounter = 0;

  constructor() {
    // Seed entries once from initialPresets (R26).
    effect(() => {
      const initial = this.initialPresets();
      this.entries.set(initial.map(pedalEntry));
    });
    // Plan load unless test mode (R53, R59).
    effect(() => {
      if (this.testMode()) return;
      this.planApi.getMyPlan().then(
        (limits) => this.plan.set(limits),
        () => this.plan.set(null),
      );
    });
  }

  // R34-R37 row controls.
  moveUp(index: number): void {
    if (this.submitting()) return;
    this.entries.set(moveEntry(this.entries(), index, -1));
  }
  moveDown(index: number): void {
    if (this.submitting()) return;
    this.entries.set(moveEntry(this.entries(), index, 1));
  }
  removeEntry(index: number): void {
    if (this.submitting()) return;
    const list = this.entries();
    const next = list.slice();
    next.splice(index, 1);
    this.entries.set(next);
    this.attachments.set(pruneAttachments(this.attachments(), this.userSlots()));
  }

  // R38-R41 — add from pedal.
  onAddPreset(slotStr: string): void {
    if (this.submitting()) return;
    const slot = Number(slotStr);
    if (!Number.isFinite(slot)) return;
    const preset = this.availablePresets().find((p) => p.slot === slot);
    if (!preset) return;
    const result = tryAppendEntry(this.entries(), pedalEntry(preset));
    if (!result.ok) {
      this.addError.set(result.error);
      return;
    }
    this.entries.set(result.list);
    this.addError.set(null);
    this.attachments.set(pruneAttachments(this.attachments(), this.userSlots()));
  }

  // R43-R50 — add from .prst file.
  async onPrstPicked(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let bytes: Uint8Array;
    try {
      const buf = await file.arrayBuffer();
      bytes = new Uint8Array(buf);
    } catch {
      this.addError.set({ key: 'saveSong.errors.prstNotGp5' });
      return;
    }
    const decoded = decodePrstFile(bytes);
    const pickError = checkPrstPick(file.name, decoded);
    if (pickError) {
      this.addError.set(pickError);
      return;
    }
    if (!decoded.ok) {
      // unreachable (checkPrstPick already mapped the error), kept for type narrowing.
      this.addError.set({ key: 'saveSong.errors.unexpected' });
      return;
    }
    this.fileCounter++;
    const key = `file:${this.fileCounter}`;
    const result = tryAppendEntry(this.entries(), fileEntry(key, file.name, decoded));
    if (!result.ok) {
      this.addError.set(result.error);
      return;
    }
    this.entries.set(result.list);
    this.addError.set(null);
    this.attachments.set(pruneAttachments(this.attachments(), this.userSlots()));
  }

  // R65-R69 — extra config rows.
  addRow(): void {
    if (this.submitting()) return;
    this.extraRows.update((rows) => [...rows, { id: nextExtraId++, key: '', value: '' }]);
  }
  removeRow(id: number): void {
    if (this.submitting()) return;
    this.extraRows.update((rows) => rows.filter((r) => r.id !== id));
  }
  onExtraKey(id: number, key: string): void {
    this.extraRows.update((rows) => rows.map((r) => (r.id === id ? { ...r, key } : r)));
  }
  onExtraValue(id: number, value: string): void {
    this.extraRows.update((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)));
  }

  // R63, R64 — cover / IR / NAM file picking.
  onFilePicked(kind: 'cover' | 'ir' | 'nam', slot: number | null, ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const err = checkPickedFile(file, kind);
    if (err) {
      const fieldKey = kind === 'cover' ? 'cover' : 'attachments';
      if (fieldKey === 'cover') {
        this.fieldErrors.update((e) => ({ ...e, cover: err }));
      } else {
        const key = `${kind}:${slot}`;
        this.fieldErrors.update((e) => ({
          ...e,
          attachments: { ...e.attachments, [key]: err },
        }));
      }
      return;
    }
    if (kind === 'cover') {
      this.cover.set(file);
      this.fieldErrors.update((e) => ({ ...e, cover: undefined }));
    } else {
      this.attachments.update((m) => {
        const next = new Map(m);
        next.set(`${kind}:${slot}`, file);
        return next;
      });
      this.fieldErrors.update((e) => {
        const next = { ...e.attachments };
        delete next[`${kind}:${slot}`];
        return { ...e, attachments: next };
      });
    }
  }

  clearFile(kind: 'cover' | 'ir' | 'nam', slot: number | null): void {
    if (kind === 'cover') {
      this.cover.set(null);
    } else if (slot !== null) {
      this.attachments.update((m) => {
        const next = new Map(m);
        next.delete(`${kind}:${slot}`);
        return next;
      });
    }
  }

  // R30, R31 — close.
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.requestClose();
  }

  requestClose(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  onBackdropClick(): void {
    this.requestClose();
  }

  // R28-R32 + R50-R97 — submit + plan.
  async submit(): Promise<void> {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.testModeNoticeShown.set(false);
    const draft: SaveSongDraft = {
      entries: this.entries(),
      name: this.name(),
      artist: this.artist(),
      cover: this.cover(),
      extraRows: this.extraRows(),
      attachments: this.attachments(),
      presetsPerSongLimit: this.plan()?.presetsPerSongLimit ?? null,
    };
    const errors = validateSaveSongDraft(draft);
    this.fieldErrors.set(errors);
    if (Object.keys(errors.entryRows).length || errors.name || errors.artist || errors.cover || errors.extraConfig || errors.presets) {
      // R70 — block submit while any client-side error is present.
      // (preset cap and duplicate-name errors are kept in entryRows/presets.)
      return;
    }
    if (this.testMode()) {
      this.testModeNoticeShown.set(true);
      return;
    }
    this.submitting.set(true);
    try {
      const fd = buildSongFormData(draft);
      const result = await this.songsApi.createSong(fd);
      this.saved.set(result);
    } catch (err) {
      const mapped = mapSaveSongError(err);
      this.serverError.set(mapped);
      if (mapped.place === 'name' || mapped.place === 'extraConfig') {
        this.fieldErrors.update((e) => ({ ...e, [mapped.place]: mapped.key }));
      }
    } finally {
      this.submitting.set(false);
    }
  }

  closeSaved(): void {
    this.closed.emit();
  }
}