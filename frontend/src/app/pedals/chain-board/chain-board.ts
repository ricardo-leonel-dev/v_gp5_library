import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PresetSlot } from '../../midi/preset';
import {
  DIMMED_CLASS,
  displayCategoryCode,
  toChainBlockView,
} from '../chain-block-view';

@Component({
  selector: 'app-chain-board',
  imports: [TranslocoDirective],
  templateUrl: './chain-board.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChainBoard {
  readonly chain = input.required<PresetSlot[]>();
  readonly selectedIndex = input<number | null>(null);

  readonly blockSelected = output<number>();

  readonly displayCategoryCode = displayCategoryCode;

  readonly blocks = computed(() =>
    this.chain().map((slot, position) => {
      const view = toChainBlockView(slot, position);
      const isSelected = this.selectedIndex() === position;
      const dimmed = !view.enabled;
      const base =
        'relative h-16 rounded-lg px-1.5 py-2 text-left shadow-sm hover:brightness-110 ' +
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ' +
        'dark:focus-visible:outline-white transition-transform motion-reduce:transition-none';
      const selectedCls = isSelected
        ? ' -translate-y-1 ring-2 ring-slate-900 ring-offset-2 ring-offset-slate-50 dark:ring-white dark:ring-offset-slate-900'
        : '';
      const blockCls = `${view.style} ${base}${selectedCls}${dimmed ? ` ${DIMMED_CLASS}` : ''}`;
      const ledCls = view.enabled
        ? 'bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.7)]'
        : 'bg-black/30';
      return { view, isSelected, blockCls, ledCls };
    }),
  );

  onBlockClick(position: number): void {
    this.blockSelected.emit(position);
  }
}