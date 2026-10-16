import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { PresetSlot } from '../../midi/preset';
import {
  describeModuleType,
  GP5_MODULE_CATEGORIES,
  GP5_MODULE_FX_TITLES,
} from '../../midi/gp5-module-vocabulary';
import {
  describeParameters,
  GP5_FX_CATALOG,
} from '../../midi/gp5-fx-catalog';
import {
  categoryStyle,
  displayCategoryCode,
  formatParameterValue,
} from '../chain-block-view';

interface ResolvedDetail {
  kind: 'resolved';
  slot: PresetSlot;
  category: string;
  categoryIndex: number;
  fxIndex: number;
  fxTitle: string;
  slotNumber?: number;
  blockStyle: string;
  parameters: ReturnType<typeof describeParameters>;
  showBrowser: boolean;
  browserEntries: ReadonlyArray<BrowserEntry>;
}

interface UnknownDetail {
  kind: 'unknown';
  slot: PresetSlot;
  parameters: ReturnType<typeof describeParameters>;
}

interface BrowserEntry {
  title: string;
  descriptionKey: string;
  parameterNames: readonly string[];
  manualPage: number;
  active: boolean;
}

@Component({
  selector: 'app-block-detail',
  imports: [TranslocoDirective],
  templateUrl: './block-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockDetail {
  readonly slot = input.required<PresetSlot>();

  readonly closed = output<void>();

  readonly browsing = signal(false);

  readonly displayCategoryCode = displayCategoryCode;
  readonly formatParameterValue = formatParameterValue;

  readonly view = computed<ResolvedDetail | UnknownDetail>(() => {
    const slot = this.slot();
    const desc = describeModuleType(slot.moduleType);
    const parameters = describeParameters(slot.moduleType, slot.parameters);
    if (desc.kind === 'resolved') {
      const categoryIndex = GP5_MODULE_CATEGORIES.indexOf(desc.category);
      const fxIndex = GP5_MODULE_FX_TITLES[categoryIndex]?.indexOf(desc.fxTitle) ?? -1;
      return {
        kind: 'resolved',
        slot,
        category: desc.category,
        categoryIndex,
        fxIndex,
        fxTitle: desc.fxTitle,
        ...(desc.slotNumber !== undefined ? { slotNumber: desc.slotNumber } : {}),
        blockStyle: categoryStyle(categoryIndex),
        parameters,
        showBrowser: categoryIndex >= 0 && fxIndex >= 0,
        browserEntries: this.browserEntries(categoryIndex, fxIndex),
      };
    }
    return { kind: 'unknown', slot, parameters };
  });

  readonly resolved = computed<ResolvedDetail | null>(() => {
    const v = this.view();
    return v.kind === 'resolved' ? v : null;
  });

  readonly unknown = computed<UnknownDetail | null>(() => {
    const v = this.view();
    return v.kind === 'unknown' ? v : null;
  });

  constructor() {
    // Reset the FX-browser disclosure whenever the parent passes a different
    // slot in. Kept as an effect so the parent never has to call a method.
    effect(() => {
      this.slot();
      this.browsing.set(false);
    });
  }

  toggleBrowsing(): void {
    this.browsing.update((v) => !v);
  }

  private browserEntries(categoryIndex: number, activeFx: number): ReadonlyArray<BrowserEntry> {
    if (categoryIndex < 0) return [];
    const titles = GP5_MODULE_FX_TITLES[categoryIndex] ?? [];
    const entries = GP5_FX_CATALOG[categoryIndex] ?? [];
    return titles.map((title, i) => {
      const entry = entries[i];
      return {
        title,
        descriptionKey: entry?.descriptionKey ?? `gp5Fx.c${categoryIndex}.f${i}`,
        parameterNames: entry?.parameterNames ?? [],
        manualPage: entry?.manualPage ?? 0,
        active: i === activeFx,
      };
    });
  }
}