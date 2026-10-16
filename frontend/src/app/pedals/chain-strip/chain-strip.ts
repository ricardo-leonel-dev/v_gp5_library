import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PresetSlot } from '../../midi/preset';
import { DIMMED_CLASS, displayCategoryCode, toChainBlockView } from '../chain-block-view';
import { PEDAL_GLYPHS, type PedalGlyphKind } from '../pedal-glyphs';
import { PedalGlyph } from '../pedal-glyph/pedal-glyph';

@Component({
  selector: 'app-chain-strip',
  imports: [TranslocoDirective, PedalGlyph],
  templateUrl: './chain-strip.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainStrip {
  readonly chain = input.required<readonly PresetSlot[]>();

  readonly displayCategoryCode = displayCategoryCode;

  readonly blocks = computed(() =>
    this.chain().map((slot, position) => {
      const view = toChainBlockView(slot, position);
      const dimmed = !view.enabled;
      // h-8 + inset bottom shadow read as the footswitch plate (R10). Keep
      // the category palette and dimmed class from feature 14 so R16-R19
      // still hold verbatim. The strip is too small for full chassis
      // differentiation (per design.md "Strip block is too small for chassis
      // differentiation"); the v6 mini-chassis sits behind the v5 glyph +
      // 3-letter code overlay.
      const cls =
        `${view.style} relative flex-1 min-w-0 h-8 rounded-sm flex flex-col items-center justify-center gap-px overflow-hidden ` +
        `shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)] font-semibold${dimmed ? ` ${DIMMED_CLASS}` : ''}`;
      const chassisKind: PedalGlyphKind | null =
        view.kind === 'resolved' ? PEDAL_GLYPHS[view.categoryIndex]?.kind ?? null : null;
      // RVB (idx 9) is a stompbox with 4 knobs — the playground variant-A
      // uses a 2×2 knob chassis for it. Other stompboxes use the generic
      // single-row chassis.
      const isRvb = view.kind === 'resolved' && view.categoryIndex === 9;
      return { view, cls, dimmed, chassisKind, isRvb };
    }),
  );
}