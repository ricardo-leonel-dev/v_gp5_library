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
  swappableEffects,
  type SwappableEffect,
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
import { parseParamInput } from '../../songs/preset-draft';

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
  swappable: readonly SwappableEffect[];
  paramErrors: ReadonlyMap<string, true>;
}

interface UnknownDetail {
  kind: 'unknown';
  slot: PresetSlot;
  parameters: ReturnType<typeof describeParameters>;
  paramErrors: ReadonlyMap<string, true>;
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
  // F27 R16, R24 — `editable` flips the detail panel into edit mode (bypass
  // switch, parameter inputs, effect picker). When false, the read-only view
  // ships exactly as F14/F30 built it, so the existing tests keep passing.
  readonly editable = input<boolean>(false);

  readonly closed = output<void>();
  // F27 R17 — bypass switch.
  readonly enabledChange = output<boolean>();
  // F27 R19, R20 — parameter value changes; the page re-validates and stores
  // them. We surface the raw typed text so the page can show the inline
  // error and keep the previous value.
  readonly parameterChange = output<{ key: string; value: number; raw: string }>();
  // F27 R22 — moduleType swap. The picker only offers swappableEffects.
  readonly moduleChange = output<string>();

  readonly browsing = signal(false);
  // F27 R20 — per-key `true` while a param input's value is non-finite.
  // Cleared when a finite number is emitted.
  readonly paramErrorByKey = signal<ReadonlyMap<string, true>>(new Map());

  readonly displayCategoryCode = displayCategoryCode;
  readonly formatParameterValue = formatParameterValue;

  readonly view = computed<ResolvedDetail | UnknownDetail>(() => {
    const slot = this.slot();
    const desc = describeModuleType(slot.moduleType);
    const parameters = describeParameters(slot.moduleType, slot.parameters);
    const paramErrors = this.paramErrorByKey();
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
        swappable: swappableEffects(categoryIndex),
        paramErrors,
      };
    }
    return { kind: 'unknown', slot, parameters, paramErrors };
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
    // Reset the FX-browser disclosure and any param errors whenever the
    // parent passes a different slot in. Kept as an effect so the parent
    // never has to call a method.
    effect(() => {
      this.slot();
      this.browsing.set(false);
      this.paramErrorByKey.set(new Map());
    });
  }

  toggleBrowsing(): void {
    this.browsing.update((v) => !v);
  }

  // F27 R17 — bypass switch.
  onBypassToggle(): void {
    this.enabledChange.emit(!this.slot().enabled);
  }

  // F27 R19, R20 — parameter input commit (blur or Enter). The page
  // receives `value: number` on success; on a non-finite input, the page
  // never gets a `value` and the param keeps the previous value.
  onParamCommit(key: string, raw: string): void {
    const parsed = parseParamInput(raw);
    if (parsed === null) {
      const next = new Map(this.paramErrorByKey());
      next.set(key, true);
      this.paramErrorByKey.set(next);
      this.parameterChange.emit({ key, value: NaN, raw });
      return;
    }
    if (this.paramErrorByKey().has(key)) {
      const next = new Map(this.paramErrorByKey());
      next.delete(key);
      this.paramErrorByKey.set(next);
    }
    this.parameterChange.emit({ key, value: parsed, raw });
  }

  // F27 R22 — moduleType swap.
  onModuleChange(moduleType: string): void {
    this.moduleChange.emit(moduleType);
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