import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PresetSlot } from '../../midi/preset';
import {
  DIMMED_CLASS,
  displayCategoryCode,
  toChainBlockView,
} from '../chain-block-view';

@Component({
  selector: 'app-chain-strip',
  imports: [TranslocoDirective],
  templateUrl: './chain-strip.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainStrip {
  readonly chain = input.required<PresetSlot[]>();

  readonly displayCategoryCode = displayCategoryCode;

  readonly blocks = computed(() =>
    this.chain().map((slot, position) => {
      const view = toChainBlockView(slot, position);
      const dimmed = !view.enabled;
      const cls = `${view.style} flex-1 min-w-0 h-5 rounded-sm text-[10px] leading-5 text-center truncate font-semibold${dimmed ? ` ${DIMMED_CLASS}` : ''}`;
      return { view, cls, dimmed };
    }),
  );
}