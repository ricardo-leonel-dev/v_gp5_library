import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PresetSlot } from '../../midi/preset';
import {
  DIMMED_CLASS,
  displayCategoryCode,
  toChainBlockView,
} from '../chain-block-view';
import { PEDAL_GLYPHS, type PedalGlyphKind } from '../pedal-glyphs';
import { PedalGlyph } from '../pedal-glyph/pedal-glyph';

// Static handle positions for the four EQ sliders (design.md "Template eq").
// Picked so the four thumbs sit visibly apart without reaching either track
// end, matching the reference board layout.
const EQ_SLIDER_TOPS_PX: readonly number[] = [10, 4, 7, 12];

// v6: full EQ chassis with 4 faders. Positions are in the 120×84 viewBox
// of the chassis-variant-A EQ primitive (verbatim from the playground).
// `tickY` and `capY` draw a slight EQ curve that reads as "engineered"
// without being noisy.
const EQ_FADERS: readonly { x: number; tickY: number; capY: number }[] = [
  { x: 28, tickY: 24, capY: 24 },
  { x: 48, tickY: 48, capY: 48 },
  { x: 72, tickY: 32, capY: 32 },
  { x: 92, tickY: 56, capY: 56 },
];

export interface ChainBlockClicked {
  position: number;
  slot: PresetSlot | null;
}

export function chassisKind(categoryIndex: number): PedalGlyphKind | null {
  return PEDAL_GLYPHS[categoryIndex]?.kind ?? null;
}

@Component({
  selector: 'app-chain-board',
  imports: [TranslocoDirective, PedalGlyph],
  templateUrl: './chain-board.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainBoard {
  readonly chain = input.required<PresetSlot[]>();
  readonly selectedIndex = input<number | null>(null);
  // v5: each row's chain-board carries its own preset name so the
  // page can route the click to the right per-row block-detail panel.
  readonly presetName = input<string>('');

  readonly blockSelected = output<number>();
  // v5: emits the active block's data on click so the page renders
  // the right-side detail panel. `slot` is null for unknown blocks.
  readonly blockClicked = output<ChainBlockClicked>();

  readonly displayCategoryCode = displayCategoryCode;
  readonly eqSliderTopsPx = EQ_SLIDER_TOPS_PX;
  protected readonly faders = EQ_FADERS;

  readonly blocks = computed(() =>
    this.chain().map((slot, position) => {
      const view = toChainBlockView(slot, position);
      const isSelected = this.selectedIndex() === position;
      const dimmed = !view.enabled;
      const base =
        'relative flex h-28 w-full flex-col items-center rounded-lg px-1 pt-3.5 pb-1.5 text-center ' +
        'shadow-sm hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        'focus-visible:outline-slate-900 dark:focus-visible:outline-white transition-transform ' +
        'motion-reduce:transition-none';
      const selectedCls = isSelected
        ? ' -translate-y-1 ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 dark:ring-white dark:ring-offset-slate-900'
        : '';
      const blockCls = `${view.style} ${base}${selectedCls}${dimmed ? ` ${DIMMED_CLASS}` : ''}`;
      const ledCls = view.enabled
        ? 'bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.7)]'
        : 'bg-black/30';
      const resolved =
        view.kind === 'resolved'
          ? {
              kind: PEDAL_GLYPHS[view.categoryIndex].kind,
              knobs: Array.from({
                length: PEDAL_GLYPHS[view.categoryIndex].knobs,
              }),
              sliders: Array.from({
                length: PEDAL_GLYPHS[view.categoryIndex].sliders,
              }),
              layout4x2: PEDAL_GLYPHS[view.categoryIndex].knobs === 4,
              categoryIndex: view.categoryIndex,
              categoryCode: view.categoryCode,
              fxTitle: view.fxTitle,
              ...(view.slotNumber !== undefined ? { slotNumber: view.slotNumber } : {}),
            }
          : null;
      return { view, isSelected, blockCls, ledCls, resolved };
    }),
  );

  onBlockClick(position: number): void {
    const slot = this.chain()[position] ?? null;
    this.blockSelected.emit(position);
    this.blockClicked.emit({ position, slot });
  }
}