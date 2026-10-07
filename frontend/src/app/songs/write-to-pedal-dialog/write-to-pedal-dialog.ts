// F5 `import_preset_to_pedal` — the "Send to pedal" dialog. Inputs are
// snapshots from the host page (R4, R26): every value, mode, and ordered
// preset list is fixed at open time. Pure form logic lives in
// `write-preset-form.ts`. Network calls live in `SongsApi`. The pedal
// side lives in `WebMidiPedalConnection` and the codec. The dialog never
// touches bytes or offsets directly — it goes through `decodeSongPreset`
// (the only place outside `src/app/midi/` that reads `.prst` layout).

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  afterNextRender,
  afterRenderEffect,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import type { Preset } from '../../midi/preset';
import type { Song } from '../song';
import { SongsApi } from '../songs-api.service';
import {
  decodeSongPreset,
  mapFetchError,
  mapPedalWriteError,
  planWrites,
  type WriteablePresetRef,
  type WriteErrorKey,
  type WritePlan,
} from '../write-preset-form';

@Component({
  selector: 'app-write-to-pedal-dialog',
  imports: [TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './write-to-pedal-dialog.html',
})
export class WriteToPedalDialog {
  readonly song = input.required<Song>(); // R3
  readonly presets = input.required<readonly WriteablePresetRef[]>(); // R3, R4, R5
  readonly closed = output<void>();

  private readonly songsApi = inject(SongsApi);
  private readonly pedal = inject(WebMidiPedalConnection);

  // Form state.
  readonly slotInput = signal<string>('0'); // R18 (default 0)
  readonly writeAll = signal<boolean>(false); // R24 (default single)
  readonly selectedSortOrder = signal<number>(0); // default first preset
  readonly submitting = signal<boolean>(false); // R31
  readonly failure = signal<WriteErrorKey | null>(null); // R8-R12, R34, R37, R39
  readonly partialProgress = signal<readonly number[]>([]); // R39
  readonly success = signal<WritePlan | null>(null); // R36, R38

  // The pedal's connection state — the dialog doesn't initiate a
  // connection (R26); it just renders the "Connect to GP-5" reminder
  // when not connected (R25).
  readonly connectionState = this.pedal.connectionState;

  // Picker input (R15-R19, R21).
  readonly parsedSlot = computed<number | null>(() => {
    const s = this.slotInput().trim();
    if (!/^[0-9]+$/.test(s)) return null;
    const n = Number(s);
    if (n < 0 || n > 99) return null;
    return n;
  });

  // The plan from the current picker value (R28, R29). In single mode
  // (R23) the dialog filters `presets()` to the picked entry; in multi
  // mode (R20) the dialog passes them all. Wrapped in a try/catch so
  // `planWrites`'s named throws (R17, R21) become `null` and `canSend`
  // flips false without the dialog ever showing the throw's text.
  readonly plan = computed<WritePlan | null>(() => {
    const m = this.parsedSlot();
    if (m === null) return null;
    const all = this.presets();
    const writeAll = this.writeAll();
    const entries: readonly WriteablePresetRef[] = writeAll
      ? all
      : [all.find((r) => r.sortOrder === this.selectedSortOrder()) ?? all[0]].filter(
          (r): r is WriteablePresetRef => r !== undefined,
        );
    if (entries.length === 0) return null;
    try {
      return planWrites({
        entries,
        startSlot: m,
        writeAll,
      });
    } catch {
      return null;
    }
  });

  // R16, R17, R21, R25, R31.
  readonly canSend = computed(() => {
    return (
      this.parsedSlot() !== null &&
      this.plan() !== null &&
      !this.submitting() &&
      this.connectionState() === 'connected'
    );
  });

  // Inline slot error key (R17, R21). `null` means no error. Returns
  // a translation key under either `writeToSlot.errors.*` (R17) or
  // `writeToSlot.errors.*` (R21).
  readonly slotError = computed<string | null>(() => {
    const s = this.slotInput().trim();
    if (s === '') return null; // R16 covers the empty case (button disabled)
    if (!/^[0-9]+$/.test(s)) return null; // R16 (also: non-integer, no error yet — just disabled)
    const n = Number(s);
    if (n < 0 || n > 99) return 'writeToSlot.errors.outOfRange'; // R17
    if (this.writeAll()) {
      const m = n;
      const N = this.presets().length;
      if (m + N - 1 > 99) {
        return 'writeToSlot.errors.notEnoughRoom';
      }
    }
    return null;
  });

  // R30 / R31 — submitting or open: ignore Escape & backdrop.
  // The R32 HostListener below still fires while submitting, but
  // `requestClose` is a no-op then.

  // Stable title id for aria-labelledby.
  readonly titleId = `write-to-pedal-title-${Math.random().toString(36).slice(2, 10)}`;

  // Picker element for autofocus.
  private readonly slotInputRef = viewChild<ElementRef<HTMLInputElement>>('slotInputEl');

  // The success panel's Close button (design "Interaction states": focus
  // moves to it once the success panel renders, R36).
  private readonly successCloseRef = viewChild<ElementRef<HTMLButtonElement>>('successCloseEl');

  constructor() {
    // Focus the picker on the first render (R29 equivalent — F4 focuses
    // the name input on open; F5 focuses the slot input).
    afterNextRender(() => {
      this.slotInputRef()?.nativeElement.focus();
    });
    // Runs after the render in which the success panel's Close button
    // appears (the query signal changes from undefined to the element).
    afterRenderEffect(() => {
      this.successCloseRef()?.nativeElement.focus();
    });
  }

  // R15-R19 input handler.
  onSlotInput(ev: Event): void {
    this.slotInput.set((ev.target as HTMLInputElement).value);
  }

  // R20-R24 mode toggle handler.
  onWriteAllChange(ev: Event): void {
    this.writeAll.set((ev.target as HTMLInputElement).checked);
  }

  // R36 — tapping a preset row picks it in single mode (no-op in multi
  // mode, where all presets are sent).
  onPresetRowClick(sortOrder: number): void {
    if (this.writeAll()) return;
    this.selectedSortOrder.set(sortOrder);
  }

  // R36 / R32 — close on success and on click-to-close, no-op while
  // submitting (R32).
  onClose(): void {
    this.closed.emit();
  }

  // R32 — Escape is ignored while a write is in flight.
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  // R32 — backdrop click is also no-op while submitting.
  onBackdropClick(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  // R28-R41 — submit pipeline.
  async submit(): Promise<void> {
    if (this.submitting()) return;
    const plan = this.plan();
    if (plan === null) return; // R16/R17/R21 — button is disabled anyway
    this.submitting.set(true);
    this.failure.set(null);
    this.partialProgress.set([]);
    const done: number[] = [];
    try {
      for (const item of plan.items) {
        // R34 — re-check connection right before each write.
        if (this.connectionState() !== 'connected') {
          this.failure.set('writeToPedal.errors.connectionLost');
          this.partialProgress.set(done);
          return;
        }
        let bytes: Uint8Array;
        try {
          bytes = await this.songsApi.getSongPreset(this.song().id, item.ref.sortOrder);
        } catch (err) {
          this.failure.set(mapFetchError(err));
          this.partialProgress.set(done);
          return;
        }
        // R8 — corrupt-file failure.
        const decoded = decodeSongPreset(bytes);
        if (!decoded.ok) {
          this.failure.set('writeToPedal.errors.corruptFile');
          this.partialProgress.set(done);
          return;
        }
        // R34 — the connection may have dropped while the fetch was in
        // flight; re-check right before handing the bytes to the pedal.
        if (this.connectionState() !== 'connected') {
          this.failure.set('writeToPedal.errors.connectionLost');
          this.partialProgress.set(done);
          return;
        }
        // R13 — build the Preset for writePreset with the chosen slot.
        const preset: Preset = { ...decoded.preset, slot: item.targetSlot };
        try {
          await this.pedal.writePreset(preset);
        } catch (err) {
          // R37 / R39 — keep the form (the user can retry), set failure,
          // list the slots already written.
          this.failure.set(mapPedalWriteError(err));
          this.partialProgress.set(done);
          return;
        }
        done.push(item.targetSlot);
        this.partialProgress.set([...done]);
      }
      // R36 / R38 — success panel replaces the form.
      this.success.set(plan);
    } finally {
      this.submitting.set(false);
    }
  }

  // Triggered by the "Connect GP-5" button inside the not-connected
  // reminder (R25). mapPedalWriteError handles writePreset failures;
  // connect() failures are surfaced by the /pedal page's own state.
  // Swallow here — the header state will reflect the result.
  async onConnect(): Promise<void> {
    try {
      await this.pedal.connect();
    } catch {
      // intentional no-op
    }
  }
}
