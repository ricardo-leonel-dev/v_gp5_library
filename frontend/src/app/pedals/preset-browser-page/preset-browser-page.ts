import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Preset, PresetSlot } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { PresetExportSelection } from '../preset-export-selection.service';
import { PresetComparisonStore } from '../preset-comparison.service';
import { ChainBoard, type ChainBlockClicked } from '../chain-board/chain-board';
import { BlockDetail } from '../block-detail/block-detail';
import { MockPresetsStore } from '../mock-presets.store';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

// v6: the page is a chip-based navigation (R22, R23) above the main
// area (R24). The drawer, compact list, sticky toolbar, voltforge
// accordion, floating tab, and no-selection fallback are REMOVED.
// Multi-select comparison still accumulates slots (R18-R20), but the main
// area renders the single active preset (R21). The mock-data control
// lives in the page header (`src/app/app.html`) and the picker overlay
// (R25-R27) opens when "Browse presets" is clicked.
@Component({
  selector: 'app-preset-browser-page',
  imports: [TranslocoDirective, ChainBoard, BlockDetail],
  templateUrl: './preset-browser-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PresetBrowserPage implements OnInit {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly mockPresets = inject(MockPresetsStore);
  readonly exportSelection = inject(PresetExportSelection);
  readonly comparison = inject(PresetComparisonStore);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly restoreWarning = this.pedal.restoreWarning;
  readonly loadState = signal<LoadState>('idle');
  // v6: `presets` is a computed that prefers the mock store over the
  // real `loadFromPedal` signal. Both sources write into the same
  // `activeSlots`/`presets` shape.
  readonly presets = signal<Preset[]>([]);
  readonly error = signal<string | null>(null);
  readonly markedSlots = this.exportSelection.markedSlots;
  readonly comparisonSlots = this.comparison.selectedSlots;

  // v6: single-active signal driven by chip selection (R21, R24). When
  // the user clicks a chip, the matching preset becomes active; the main
  // area renders its chain board.
  readonly activePreset = signal<Preset | null>(null);

  // v6: picker overlay open/close (R25). True while the overlay is
  // visible; flipped by `openPicker()` and `closePicker()`. Escape key
  // also closes the picker.
  readonly pickerOpen = signal(false);

  // v6: derived from `activePreset` and the comparison set (R21, R24).
  // If no chip has been activated but the comparison set is non-empty,
  // fall back to the lowest-slot preset in the comparison set.
  readonly displayPreset = computed<Preset | null>(() => {
    const explicit = this.activePreset();
    if (explicit) return explicit;
    const slots = this.comparisonSlots();
    if (slots.size === 0) return null;
    const lowest = Math.min(...Array.from(slots));
    return this.presets().find((p) => p.slot === lowest) ?? null;
  });

  // v6: ordered list of slots currently in the comparison set. The chip
  // row renders one chip per slot in this order (R22).
  readonly chipSlots = computed<readonly number[]>(() => {
    const slots = this.comparisonSlots();
    return Array.from(slots).sort((a, b) => a - b);
  });

  // v6: per-preset block detail tracking — maps the active row's slot to
  // the currently selected block in that row's chain. Carried forward
  // from v5 (R24).
  private readonly selectedBlockBySlot = signal<ReadonlyMap<number, ChainBlockClicked>>(
    new Map(),
  );

  constructor() {
    // v6: when mock data is loaded via the header button, mirror it into
    // the page-level `presets` signal so the main area picks it up. The
    // real `loadPresets()` path still wins when it succeeds (overwriting
    // the mock). Done via `effect` so the page reacts without subscriptions.
    effect(() => {
      const mock = this.mockPresets.presets();
      if (mock.length > 0 && this.loadState() !== 'loaded') {
        this.presets.set(mock);
        this.loadState.set('loaded');
        this.error.set(null);
      }
    });
  }

  ngOnInit(): void {
    if (!this.supported) return;
    if (this.connectionState() !== 'connected') return;
    void this.loadPresets();
  }

  isInComparison(slot: number): boolean {
    return this.comparisonSlots().has(slot);
  }

  // v6: chip click (R21). The chip body sets the active preset; the "×"
  // control fires `onChipRemove` (R20).
  onChipClick(slot: number): void {
    const preset = this.presets().find((p) => p.slot === slot) ?? null;
    this.activePreset.set(preset);
  }

  // v6: chip removal (R20). Removes the slot from the comparison set; if
  // the removed preset was active, the active preset falls back to null
  // so `displayPreset` derives from the remaining comparison set.
  onChipRemove(slot: number, ev: Event): void {
    ev.stopPropagation();
    this.comparison.remove(slot);
    if (this.activePreset()?.slot === slot) {
      this.activePreset.set(null);
    }
  }

  // v6: picker (R25).
  openPicker(): void {
    this.pickerOpen.set(true);
  }

  closePicker(): void {
    this.pickerOpen.set(false);
  }

  // v6: picker row activation (R26). Adds the slot to the comparison set
  // and closes the picker; `displayPreset` will pick up the new active
  // preset via the comparison-set fallback (R21).
  onPickerRow(preset: Preset): void {
    this.comparison.add(preset.slot);
    this.activePreset.set(preset);
    this.pickerOpen.set(false);
  }

  // v6: Escape closes the picker (R25).
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pickerOpen()) {
      this.pickerOpen.set(false);
    }
  }

  // v6: helper for the chip row — returns the preset's name for the
  // chip body; falls back to "—" when the preset isn't loaded (R27).
  nameFor(slot: number): string {
    const p = this.presets().find((x) => x.slot === slot);
    return p?.name ?? '—';
  }

  onExportMarkChange(slot: number): void {
    this.exportSelection.toggle(slot);
  }

  onBlockClicked(presetSlot: number, click: ChainBlockClicked): void {
    this.selectedBlockBySlot.update((m) => {
      const next = new Map(m);
      if (m.get(presetSlot) === click && click.slot) {
        // Same block clicked again → close it (same toggle v5 had).
        next.delete(presetSlot);
      } else {
        next.set(presetSlot, click);
      }
      return next;
    });
  }

  selectedBlockFor(slot: number): ChainBlockClicked | undefined {
    return this.selectedBlockBySlot().get(slot);
  }

  private async loadPresets(): Promise<void> {
    this.loadState.set('loading');
    this.error.set(null);
    try {
      const real = await this.pedal.readPresets();
      // Real read overrides any mock data loaded via the header button.
      this.presets.set(real);
      this.mockPresets.clear();
      this.loadState.set('loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      this.error.set(message === 'not_connected' ? 'not_connected_error' : message);
      this.loadState.set('error');
    }
  }
}