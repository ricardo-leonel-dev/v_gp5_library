import type { PresetSlot } from '../midi/preset';
import {
  describeModuleType,
  GP5_MODULE_CATEGORIES,
  GP5_MODULE_FX_TITLES,
} from '../midi/gp5-module-vocabulary';

// View-model for a single chain entry as the UI components render it.
// `kind: 'resolved'` carries enough data to draw a category-colored block
// without re-running the vocabulary lookup in the template; `kind: 'unknown'`
// is the neutral path for `parseModuleType` failures and out-of-table
// `(cat, fxlow)` pairs (R19).
export type ChainBlockView =
  | {
      kind: 'resolved';
      position: number;
      categoryIndex: number;
      categoryCode: string;
      fxIndex: number;
      fxTitle: string;
      slotNumber?: number;
      enabled: boolean;
      style: string;
    }
  | {
      kind: 'unknown';
      position: number;
      enabled: boolean;
      style: string;
    };

export function toChainBlockView(slot: PresetSlot, position: number): ChainBlockView {
  const description = describeModuleType(slot.moduleType);
  if (description.kind === 'resolved') {
    const categoryIndex = GP5_MODULE_CATEGORIES.indexOf(description.category);
    const fxIndex = GP5_MODULE_FX_TITLES[categoryIndex]?.indexOf(description.fxTitle) ?? -1;
    return {
      kind: 'resolved',
      position,
      categoryIndex,
      categoryCode: description.category,
      fxIndex,
      fxTitle: description.fxTitle,
      ...(description.slotNumber !== undefined ? { slotNumber: description.slotNumber } : {}),
      enabled: slot.enabled,
      style: categoryStyle(categoryIndex),
    };
  }
  return {
    kind: 'unknown',
    position,
    enabled: slot.enabled,
    style: NEUTRAL_BLOCK_STYLE,
  };
}

// --- R13, R14: category palette ------------------------------------------
// Each class string is taken verbatim from design.md "Visual direction ->
// Category palette" so Tailwind's content scan picks them up. They are not
// built by interpolation; editing them here is the only way to tune the
// palette.
export const NEUTRAL_BLOCK_STYLE =
  'bg-transparent border border-dashed border-slate-400 text-slate-500 dark:border-slate-500 dark:text-slate-400';

export const DIMMED_CLASS = 'opacity-40';

export function categoryStyle(categoryIndex: number): string {
  switch (categoryIndex) {
    case 0:
      return 'bg-cyan-700 text-white dark:bg-cyan-600';
    case 1:
      return 'bg-yellow-400 text-yellow-950 dark:bg-yellow-300';
    case 2:
      return 'bg-green-700 text-white dark:bg-green-600';
    case 3:
      return 'bg-rose-600 text-white dark:bg-rose-500';
    case 4:
      return 'bg-amber-500 text-amber-950 dark:bg-amber-400';
    case 5:
      return 'bg-stone-600 text-stone-50 dark:bg-stone-500';
    case 6:
      return 'bg-zinc-300 text-zinc-900 dark:bg-zinc-400';
    case 7:
      return 'bg-violet-600 text-white dark:bg-violet-500';
    case 8:
      return 'bg-sky-500 text-sky-950 dark:bg-sky-400';
    case 9:
      return 'bg-blue-800 text-white dark:bg-blue-700';
    default:
      return NEUTRAL_BLOCK_STYLE;
  }
}

// --- R9, R10: formatParameterValue ---------------------------------------
export function formatParameterValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  // Math.round of (value * 100) / 100 gives at most 2 decimal places with
  // no trailing zeros by construction; -0 normalizes to "0" via String(-0).
  return String(Math.round(value * 100) / 100);
}

// `displayCategoryCode` rewrites the only category whose stored code uses
// ASCII ('N->S') to its Unicode form for display. Every other code is its
// own display form.
export function displayCategoryCode(code: string): string {
  return code === 'N->S' ? 'N→S' : code;
}