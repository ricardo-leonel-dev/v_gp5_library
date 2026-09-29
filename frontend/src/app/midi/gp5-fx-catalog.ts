/**
 * Per-FX parameter-name catalog — the human-readable names of each FX's `p0`
 * ..`p7` controls, transcribed from external_docs/gp-5-manual.pdf pp.20-36
 * ("Effect List", "Parameter Description" column). Sits beside
 * `gp5-module-vocabulary.ts` because it is the same kind of manual-derived
 * pedal knowledge; category and FX-title vocabulary comes from there
 * (R1-aligned length).
 *
 * HYPOTHESIS (status: see `GP5_FX_PARAMETER_MAPPING_STATUS`):
 *   1. Index order: `p<k>` is assumed to be the `k`-th control listed in
 *      that FX's "Parameter Description" cell, reading top to bottom, with
 *      combined labels expanded left to right (`Bass/Middle/Treble` -> Bass,
 *      Middle, Treble; `Gain 1/2` -> Gain 1, Gain 2; `High/Low` -> High,
 *      Low; `H/L-VOL` -> H-VOL, L-VOL; `Bass/Treble` -> Bass, Treble;
 *      `Dry/Wet` -> Dry, Wet). Nothing in the manual states this
 *      correspondence; it is the simplest guess.
 *   2. Scale: values are shown exactly as decoded (float32, rounded for
 *      display by `formatParameterValue`) — no unit, no 0-100 rescale, no
 *      dB/ms conversion, no enum names for switch-like controls (`+3dB`,
 *      `Bright`, `Mode`, `Char`, `MidFreq`, `Trail`).
 *   3. Trail: every DLY/RVB FX lists `Trail` last. It may be a global
 *      setting stored elsewhere rather than a per-block `p<k>`. Listed per
 *      the manual for now.
 *   4. Unmapped slots: for a resolved FX with `n < 8` names, slots
 *      `p<n>`..`p7` are not shown (R6). This hides data if hypothesis 1 is
 *      wrong.
 *
 * Transcription notes (kept here as a comment so future readers see why
 * specific entries look the way they do):
 *   - Longest list is Ring Echo (7), so every list fits in `p0`..`p7`.
 *   - EQ rows: the manual writes `Band 1: 125Hz` ... and "use the five
 *     bands above". The label is the frequency alone (`125Hz`), which is
 *     what the pedal's knobs are known by. Mess EQ has no trailing VOL.
 *   - Detune (p.21): the manual writes `Dry/Wet: Controls the dry/wet
 *     signal level`. Read here as two controls (`Dry`, `Wet`), matching how
 *     `Bass/Treble` and `High/Low` expand. Covered by the HYPOTHESIS.
 *   - EV 51 (p.28) lists `PRES` last, unlike other amps. Transcribed as
 *     printed.
 *   - MOD: the manual continues MOD onto p.33 with O-Trem, Sine Trem, Bias
 *     Trem. Feature 10 kept MOD at 8 entries; R1 aligns the catalog to
 *     feature 10, so these three are **not** in the catalog or the FX
 *     browser.
 *
 * Nothing in this file can confirm the hypothesis. It needs Ricardo to
 * read a patch with known knob positions from the real GP-5 and compare
 * (tasks.md's final task, left unchecked by design).
 */
import { describeModuleType, parseModuleType } from './gp5-module-vocabulary';

// --- R1-R4: GP5_FX_CATALOG -------------------------------------------------
// `parameterNames` — one entry per `p<k>` slot the FX exposes
// (`p0`..`p<parameterNames.length-1>`); `manualPage` — manual page where
// the FX is described; `descriptionKey` — `gp5Fx.c<c>.f<i>` for i18n.
export interface Gp5FxCatalogEntry {
  readonly parameterNames: readonly string[];
  readonly manualPage: number;
  readonly descriptionKey: string;
}

function entry(parameterNames: readonly string[], manualPage: number, c: number, i: number): Gp5FxCatalogEntry {
  return { parameterNames, manualPage, descriptionKey: `gp5Fx.c${c}.f${i}` };
}

export const GP5_FX_CATALOG: readonly (readonly Gp5FxCatalogEntry[])[] = [
  // 0: NR — p.20
  [
    entry(['THRE'], 20, 0, 0),
  ],
  // 1: PRE — pp.20-21
  [
    entry(['Sustain', 'VOL'], 20, 1, 0),
    entry(['Sustain', 'Attack', 'Volume', 'Clipping'], 20, 1, 1),
    entry(['Gain', '+3dB', 'Bright'], 20, 1, 2),
    entry(['Gain'], 20, 1, 3),
    entry(['Gain', 'VOL', 'Bass', 'Treble'], 21, 1, 4),
    entry(['Sense', 'Range', 'Q', 'Mix', 'Mode'], 21, 1, 5),
    entry(['Depth', 'Rate', 'Volume', 'Low', 'Q', 'High'], 21, 1, 6),
    entry(['Low', 'High', 'Dry'], 21, 1, 7),
    entry(['High', 'Low', 'Dry', 'H-VOL', 'L-VOL'], 21, 1, 8),
    entry(['Detune', 'Dry', 'Wet'], 21, 1, 9),
  ],
  // 2: DST — pp.22-23
  [
    entry(['Gain', 'Tone', 'VOL'], 22, 2, 0),
    entry(['Gain', 'Tone', 'VOL'], 22, 2, 1),
    entry(['Gain', 'Tone', 'VOL'], 22, 2, 2),
    entry(['Gain', 'Tone', 'VOL'], 22, 2, 3),
    entry(['Gain', 'VOL'], 22, 2, 4),
    entry(['Gain', 'Tone', 'VOL'], 23, 2, 5),
    entry(['Gain', 'Filter', 'VOL'], 23, 2, 6),
    entry(['Fuzz', 'VOL'], 23, 2, 7),
    entry(['Fuzz', 'VOL'], 23, 2, 8),
    entry(['Gain', 'Blend', 'VOL', 'Bass', 'Treble'], 23, 2, 9),
  ],
  // 3: N->S — p.23
  [
    entry(['Gain', 'VOL', 'Bass', 'Middle', 'Treble'], 23, 3, 0),
  ],
  // 4: AMP — pp.24-30
  [
    entry(['Gain', 'Tone', 'VOL'], 24, 4, 0),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 24, 4, 1),
    entry(['Gain', 'VOL', 'Bass', 'Middle', 'Treble', 'Bright'], 24, 4, 2),
    entry(['Gain', 'Tone cut', 'VOL', 'Bright'], 24, 4, 3),
    entry(['VOL', 'Bass', 'Middle', 'Treble', 'Bright'], 24, 4, 4),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 25, 4, 5),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 25, 4, 6),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 25, 4, 7),
    entry(['Gain 1', 'Gain 2', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 25, 4, 8),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 25, 4, 9),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 26, 4, 10),
    entry(['Gain', 'Tone cut', 'VOL', 'Bass', 'Treble', 'Char'], 26, 4, 11),
    entry(['Gain 1', 'Gain 2', 'Tone 1', 'Tone 2', 'VOL'], 26, 4, 12),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 26, 4, 13),
    entry(['Gain', 'Tone cut', 'VOL', 'Bass', 'Middle', 'Treble'], 26, 4, 14),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Treble', 'Edge'], 27, 4, 15),
    entry(['Gain', 'VOL', 'Bass', 'Middle', 'Treble'], 27, 4, 16),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 27, 4, 17),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 27, 4, 18),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 27, 4, 19),
    entry(['Gain', 'VOL', 'Bass', 'Middle', 'Treble', 'PRES'], 28, 4, 20),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 28, 4, 21),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 28, 4, 22),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 28, 4, 23),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 28, 4, 24),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 28, 4, 25),
    entry(['Gain', 'PRES', 'VOL', 'Bass', 'Middle', 'Treble'], 29, 4, 26),
    entry(['Gain', 'Bass', 'Middle', 'Treble', 'MidFreq', 'VOL'], 29, 4, 27),
    entry(['VOL', 'Bass', 'Treble'], 29, 4, 28),
    entry(['Gain', 'VOL', 'Bass', 'Middle', 'Treble'], 29, 4, 29),
    entry(['VOL', 'Tone', 'Balance', 'EQ Freq', 'EQ Q', 'EQ Gain'], 29, 4, 30),
    entry(['VOL', 'Tone', 'Balance', 'EQ Freq', 'EQ Q', 'EQ Gain'], 30, 4, 31),
  ],
  // 5: CAB — pp.30-31 (R1 alignment with GP5_MODULE_FX_TITLES; every CAB FX
  // exposes a single VOL control)
  [
    entry(['VOL'], 30, 5, 0),
    entry(['VOL'], 30, 5, 1),
    entry(['VOL'], 30, 5, 2),
    entry(['VOL'], 30, 5, 3),
    entry(['VOL'], 30, 5, 4),
    entry(['VOL'], 30, 5, 5),
    entry(['VOL'], 30, 5, 6),
    entry(['VOL'], 30, 5, 7),
    entry(['VOL'], 30, 5, 8),
    entry(['VOL'], 30, 5, 9),
    entry(['VOL'], 30, 5, 10),
    entry(['VOL'], 30, 5, 11),
    entry(['VOL'], 30, 5, 12),
    entry(['VOL'], 30, 5, 13),
    entry(['VOL'], 30, 5, 14),
    entry(['VOL'], 30, 5, 15),
    entry(['VOL'], 30, 5, 16),
    entry(['VOL'], 30, 5, 17),
    entry(['VOL'], 30, 5, 18),
    entry(['VOL'], 31, 5, 19),
    entry(['VOL'], 31, 5, 20),
  ],
  // 6: EQ — p.31
  [
    entry(['125Hz', '400Hz', '800Hz', '1.6kHz', '4kHz', 'VOL'], 31, 6, 0),
    entry(['100Hz', '500Hz', '1kHz', '3kHz', '6kHz', 'VOL'], 31, 6, 1),
    entry(['33Hz', '150Hz', '600Hz', '2kHz', '8kHz', 'VOL'], 31, 6, 2),
    entry(['50Hz', '120Hz', '400Hz', '800Hz', '4.5kHz', 'VOL'], 31, 6, 3),
    entry(['80Hz', '240Hz', '750Hz', '2.2kHz', '6.6kHz'], 31, 6, 4),
  ],
  // 7: MOD — p.32 (8 entries per feature 10; tremolo entries on p.33 omitted)
  [
    entry(['Depth', 'Rate', 'Tone'], 32, 7, 0),
    entry(['Depth', 'Rate', 'VOL'], 32, 7, 1),
    entry(['Depth', 'Rate', 'P.Delay', 'F.Back'], 32, 7, 2),
    entry(['Depth', 'Rate', 'P.Delay', 'F.Back'], 32, 7, 3),
    entry(['Rate'], 32, 7, 4),
    entry(['Depth', 'Rate'], 32, 7, 5),
    entry(['Depth', 'Rate'], 32, 7, 6),
    entry(['Depth', 'Rate', 'VOL'], 32, 7, 7),
  ],
  // 8: DLY — pp.33-34
  [
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 33, 8, 0),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 33, 8, 1),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 33, 8, 2),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 33, 8, 3),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 34, 8, 4),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 34, 8, 5),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 34, 8, 6),
    entry(['Mix', 'Time', 'F.Back', 'R-Mix', 'Freq', 'Tone', 'Trail'], 34, 8, 7),
    entry(['Mix', 'Time', 'F.Back', 'S-Depth', 'S-Rate', 'Trail'], 34, 8, 8),
    entry(['Mix', 'Time', 'F.Back', 'Trail'], 34, 8, 9),
  ],
  // 9: RVB — pp.35-36
  [
    entry(['Mix', 'Decay', 'Damp', 'Trail'], 35, 9, 0),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 1),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 2),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 3),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 4),
    entry(['Mix', 'Decay', 'Damp', 'Trail'], 35, 9, 5),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 6),
    entry(['Mix', 'Decay', 'Trail'], 35, 9, 7),
    entry(['Mix', 'Decay', 'Trail'], 36, 9, 8),
    entry(['Mix', 'Decay', 'Damp', 'Mod', 'Trail'], 36, 9, 9),
  ],
];

// --- R11, R12: parameter-mapping status ----------------------------------
// Update this constant (and T11's test) once the hardware verification in
// tasks.md's final task is performed.
export const GP5_FX_PARAMETER_MAPPING_STATUS =
  'HYPOTHESIS — p0..p7 -> parameter-name and value-scale mapping derived ' +
  'from external_docs/gp-5-manual.pdf pp.20-36 ("Parameter Description" ' +
  'column). NOT yet confirmed against real GP-5 hardware; see ' +
  "specs/gp5_preset_chain_visual_board/tasks.md's final task.";

// --- R6-R8: describeParameters -------------------------------------------
// Labelled only when `describeModuleType(...).kind === 'resolved'` **and**
// `GP5_FX_CATALOG[cat]?.[fxlow]` exists; given R1 the second check always
// passes, but it is kept as a guard so a future vocabulary change cannot
// silently produce a different shape.
export interface DescribedParameter {
  readonly label: string;
  readonly value: number | null;
}

export function describeParameters(
  moduleType: string,
  parameters: Readonly<Record<string, number>>,
): DescribedParameter[] {
  const parsed = parseModuleType(moduleType);
  if (parsed && describeModuleType(moduleType).kind === 'resolved') {
    const cat = parsed.cat;
    const fx = parsed.fxlow;
    const category = GP5_FX_CATALOG[cat];
    const entry = category?.[fx];
    if (entry) {
      return entry.parameterNames.map((label, k) => ({
        label,
        value: parameters[`p${k}`] ?? null,
      }));
    }
  }
  return rawParameters(parameters);
}

// Sorts keys matching /^p(\d+)$/ numerically ascending, appends any
// other keys in insertion order after them.
function rawParameters(parameters: Readonly<Record<string, number>>): DescribedParameter[] {
  const numeric: { key: string; n: number }[] = [];
  const other: string[] = [];
  for (const key of Object.keys(parameters)) {
    const match = /^p(\d+)$/.exec(key);
    if (match) {
      numeric.push({ key, n: parseInt(match[1], 10) });
    } else {
      other.push(key);
    }
  }
  numeric.sort((a, b) => a.n - b.n);
  return [
    ...numeric.map(({ key }) => ({ label: key, value: parameters[key] ?? null })),
    ...other.map((key) => ({ label: key, value: parameters[key] ?? null })),
  ];
}