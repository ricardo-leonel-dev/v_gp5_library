# Design — gp5_module_vocabulary_hardware_re_verification

Conventions: `docs/conventions.md` (colocated `*.spec.ts`, plain Vitest for pure logic, comments only for a
non-obvious *why*) and `docs/architecture.md`. Both still apply. This feature adds no Angular DI and no UI. New
i18n keys are limited to the descriptions of appended titles (R24).

## In plain terms (for approval)

The pedal stores each effect as a short code, such as `cat7_fx4`. Today the app guesses the effect name by
counting down the manual's lists: "category 7, row 4". Preset 0 proves that guess is wrong: `cat7_fx4` is really
AMP / Dark Twin, but the app shows MOD / O-Phase. This feature replaces the guess with a lookup table, like a
phone book that says "code `cat7_fx4` = AMP / Dark Twin". Every line in the table is copied from a real reading
of your pedal. Capturing every effect (Q1) is what makes that table complete. The two answers work together:
the table is the mechanism, and the exhaustive capture fills it.

## What the evidence says

Feature 18 captured one preset (slot 0, "TL DLX AMP") on 2026-09-28. The codec's byte reading was pinned against
it in `gp5-sysex-preset-codec.spec.ts`.

| block | raw bytes | moduleType | feature 10 says | GP-5 shows |
| ----- | --------- | ---------- | --------------- | ---------- |
| 0 | `1b 00 00 00` | `cat0_fx1b` | raw (fx out of range) | not recorded; presumably NR (see below) |
| 1 | `00 00 00 00` | `cat0_fx0` | NR / Gate | PRE / COMP |
| 3 | `04 00 00 07` | `cat7_fx4` | MOD / O-Phase | AMP / Dark Twin |
| 4 | `00 00 10 0a` | `cata_fx100000` | raw (cat 10) | CAB / User IR 1-20 |

What this shows:
1. `cat` is not the p.40 category index. Page 40 is a CC table for module on/off switches, and nothing in the
   manual links it to the SysEx `cat` byte.
2. `fxlow` is not a dense row index. `0x100000` means byte 2 carries its own field, and T1 step 1d settles what
   that field is.
3. No arithmetic rule can be trusted from 3-4 data points. Only an explicit per-code table, where every row cites
   a real capture, holds up.

### Chain order: the pedal's 10 blocks vs the codec's slot model

**Q3 resolved (user, 2026-09-28):** "TL DLX AMP" is preset 0's *name*, not a module. The pedal shows preset 0's
chain as `NR - PRE - DST - N->S - AMP - CAB - EQ - MOD - DLY - RVB`, which is 10 blocks. The user says the order
can be rearranged on the pedal.

How the codec models this (`decodeBody`, unchanged):
- The preset body carries 10 REC_MODELS records, one per **block** (`blockIndex` 0-9), each holding that block's
  4-byte code.
- A separate REC_ORDER record holds 10 bytes, where `order[chainPosition] = blockIndex`.
- `decodeBody` builds the per-block slots first, then emits `chain[chainPosition] = blocks[order[chainPosition]]`.
  So each `PresetSlot.moduleType` is the code of whichever block sits at that chain position.

How this reconciles with the preset-0 evidence: feature 18 recorded chain[1] = block 1 (PRE/COMP), chain[4] =
block 3 (AMP/Dark Twin), and chain[5] = block 4 (CAB/User IR). Those chain positions match the user's displayed
order exactly: position 1 = PRE, 4 = AMP, 5 = CAB. Block 3 sitting at chain position 4 shows that REC_ORDER is
*not* the identity for this preset. Block index and chain position are different things, and the codec's
REC_ORDER step is what lines them up with the pedal's display. Block 0 (`cat0_fx1b`) presumably sits at chain
position 0 = NR, so NR / Gate is the likely title, but it was never recorded. T1 step 1c records it rather than
assuming it.

Consequences for this design:
1. **No category is ever inferred from slot position.** Every lookup is keyed on the hardware code alone (R25).
   The user's reorder answer rules out position-based inference, and so does the evidence: position 4 is AMP
   because its *code* says so.
2. **What still has to be observed** (T1 step 1e): when a block is moved on the pedal, does its code travel with
   it? The codec model predicts that REC_MODELS stays put and only REC_ORDER changes, so the code still arrives at
   the new chain position. If instead REC_MODELS itself is re-ordered and REC_ORDER stays the same, decoding is
   still correct, because the code still arrives with its block. The only outcome that breaks the design is a code
   whose meaning depends on which block holds it. R9's conflict test detects that (see "Error paths").
3. **`cat` is still not a category index.** Chain positions 0 (presumably NR) and 1 (PRE) both have `cat 0`, and
   AMP has `cat 7`. The per-code table is required either way.

### SnapTones (N->S)

The pedal ships with factory SnapTones, and the user can import more. Each imported bank takes its name from the
imported file's name (user answer, 2026-09-28). Decision:
- **Factory SnapTones** are fixed product vocabulary. Their names go in `GP5_MODULE_FX_TITLES[3]` after `'Empty'`,
  spelled and ordered as the pedal lists them, with the manual pp.37-39 list as a cross-check (R21).
- **User-imported SnapTones** are user data. They are shown as one generic `User SnapTone` title (R21, R22), the
  same way `User IR 1-20` already works for user cabinet IRs. **They are not read from the device.** The codec
  has no SnapTone-name read today, and the SysEx request for SnapTone file names is unknown. Adding it would be a
  protocol feature (new opcode, a new `Preset` field, hardware verification), which is outside a vocabulary fix.
  A hard-coded list of Ricardo's current file names would go stale the moment he imports or deletes one. Showing
  the real imported name is a candidate follow-up feature. The literal name seen during T1 is kept in the
  fixture's `pedalDisplayName`, so that follow-up has evidence to start from.
- T1 must record which N->S codes are factory and which are user-imported (step 1d), and whether importing a file
  can overwrite a factory slot. If it can, that code's row is recorded as whatever the slot held at capture time.

## Architecture

```
Gp5SysexPresetCodec.decodeBody()   (UNCHANGED)
        │  moduleType = "cat7_fx4"
        ▼
GP5_HARDWARE_MODULE_CODES          (NEW, gp5-module-vocabulary.ts)   "cat7_fx4" -> { categoryIndex: 4, fxIndex: 2 }
        │                                  ▲ every entry justified by (R8); every canonical pair covered (R5)
        │                          GP5_HARDWARE_CAPTURES (NEW, gp5-hardware-captures.ts)
        ▼
GP5_MODULE_CATEGORIES / GP5_MODULE_FX_TITLES  (canonical tables: existing indices frozen, appends only, R19-R21)
        │                                  ▲ same [c][i] indexing
        ▼                          GP5_FX_CATALOG + gp5Fx.c<c>.f<i> i18n keys (appends only, R23/R24)
decodeModule / describeModuleType / resolveModuleIndices / describeParameters
```

The canonical tables remain the index space for `GP5_FX_CATALOG`, the FX browser (`block-detail.ts:118-119`), and
the `gp5Fx.c<c>.f<i>` i18n keys. Because existing indices never move, none of those break. Only the entry point
changes: hardware code → canonical pair.

## Files to touch

| File | Change |
| ---- | ------ |
| `src/app/midi/gp5-hardware-captures.ts` (new) | `Gp5HardwareCapture` interface + `GP5_HARDWARE_CAPTURES` (R1, R4). Data only. It lives in `src/` because `progress/` is git-excluded, and this is the audit trail. |
| `src/app/midi/gp5-hardware-captures.spec.ts` (new) | Fixture integrity tests (R2, R3, R4, R9). |
| `src/app/midi/gp5-module-vocabulary.ts` | Add `GP5_HARDWARE_MODULE_CODES` (R7), `GP5_UNCAPTURABLE_FX` (R6), and `resolveModuleIndices` (R13, R14). Rewrite `decodeModule` (R11, R12). Append titles (R20, R21). Rewrite the header comment and `GP5_MODULE_VOCABULARY_STATUS` (R17, R18). |
| `src/app/midi/gp5-module-vocabulary.spec.ts` | Replace positional tests with R5, R6, R8, R10-R14, R17-R19, R21 tests. Keep feature 10's parse tests. Feature 10's R3 length test becomes a prefix test (R19). |
| `src/app/midi/gp5-fx-catalog.ts` | `describeParameters` uses `resolveModuleIndices` (R15, R16). Append catalog entries (R23). |
| `src/app/midi/gp5-fx-catalog.spec.ts` | Replace positional literals with captured codes (R15). Keep `cat99_fx0` (R16). Add appended-entry checks (R23). |
| `public/i18n/{es,en}.json` | `gp5Fx.c<c>.f<i>` descriptions for appended titles (R24). The existing `i18n-parity.spec.ts` keeps es/en in lockstep. |
| `src/app/pedals/{chain-block-view,chain-strip/chain-strip,chain-board/chain-board,block-detail/block-detail,preset-browser-page/preset-browser-page}.spec.ts` | Re-point `moduleType` literals that relied on the old mapping (`cat4_fx0` ×17, `cat1_fx0` ×17, `cat8_fx0` ×8, `cat4_fx1` ×6, `cat5_fx0`, `cat4_fx2`, `cat4_fx5`) to captured codes with the same intended meaning. `cat99_fx0` and `cat1_fx999` stay unresolved **only if** they are still absent from the table; otherwise pick another absent code. |
| `src/app/midi/gp5-sysex-preset-codec.spec.ts` | Add one R25 test (reordered REC_ORDER). Test-only; feature 18's test stays untouched. |
| `src/app/midi/gp5-sysex-preset-codec.ts` | **Header comment only.** Update the "IMPORTANT" paragraph to say feature 19 closed the gap. |
| `specs/gp5_module_vocabulary_decoding/tasks.md` | Tick T17 and cite `gp5-hardware-captures.ts`. |
| `specs/gp5_module_vocabulary_decoding/requirements.md` | Add a one-line "Superseded by feature 19" note under feature 10's R3, R4, and R11. |
| `progress/gp5_webmidi_body_read_probe.html` (local tooling) | Add a "copy as capture rows" button (T2). This is strongly recommended, because ~60 reads by hand is error-prone. |

`chain-block-view.ts` and `block-detail.ts` are not expected to change. They `indexOf` the resolved title back
into the canonical tables, and that still works. Any place that indexes the canonical tables with raw
`parseModuleType` output must switch to `resolveModuleIndices`. `describeParameters` does this today.

## New signatures

```ts
// gp5-hardware-captures.ts
export interface Gp5HardwareCapture {
  readonly source: string;          // 'YYYY-MM-DD preset <slot> <name>'
  readonly blockIndex: number;      // 0-9
  readonly chainPosition: number;   // 0-9
  readonly rawBytes: readonly [number, number, number, number];
  readonly moduleType: string;      // R2
  readonly pedalCategory: string;   // R3
  readonly pedalFxTitle: string;    // R3, spelled as the pedal / Valeton Suite shows it
}
export const GP5_HARDWARE_CAPTURES: readonly Gp5HardwareCapture[];

// gp5-module-vocabulary.ts
export interface CanonicalModuleIndices { readonly categoryIndex: number; readonly fxIndex: number; }
export const GP5_HARDWARE_MODULE_CODES: ReadonlyMap<string, CanonicalModuleIndices>;
export const GP5_UNCAPTURABLE_FX: readonly (CanonicalModuleIndices & { readonly reason: string })[];
export function resolveModuleIndices(moduleType: string): CanonicalModuleIndices | null;
// unchanged signatures, new behaviour:
export function decodeModule(cat: number, fxlow: number): ModuleDescription;
export function describeModuleType(moduleType: string): DescribedModuleType;
```

Implementation notes:
- `decodeModule` builds the key as `` `cat${cat.toString(16)}_fx${fxlow.toString(16)}` ``. Negative or
  non-integer inputs produce keys that are not in the map, so they fall back to raw.
- **`GP5_HARDWARE_MODULE_CODES` is a hand-written literal. Do not derive it at runtime from the captures.** R8 is
  a cross-check between two independently written artifacts, and deriving one from the other would make it
  vacuous. Write one entry per line with a trailing `// CATEGORY / Title` comment. With exhaustive capture it
  will have roughly 150-200 entries (see the checklist below), so group entries by category.
- `gp5-module-vocabulary.ts` must not import `gp5-hardware-captures.ts`. The fixture is spec-only.
- Many codes can map to one canonical pair. For example, each User IR slot or each user SnapTone slot may have
  its own code. That is expected, and every code needs its own capture row (R8).

## Error paths

- Unknown hardware code → raw fallbacks everywhere (R12, R14, R16, and feature 10's `describeModuleType` raw
  path). Nothing throws.
- **R9 conflict** (same code, two titles) → the implementer stops and `append-log`s a blocker. Do not pick one.
  If the conflict tracks `blockIndex` or `chainPosition` (a code whose meaning depends on which block holds it),
  the key must become `(blockIndex, code)`. `PresetSlot` does not carry the block index after `REC_ORDER` is applied, so that would
  be a codec/`PresetSlot` change, which is out of scope and needs a spec amendment approved by the user.
- A capture whose title the pedal shows but which fits neither R20 nor R21 (should not happen) → block and
  escalate. Do not force it into a category.

## T1 capture procedure and checklist (performed by Ricardo)

Label source: the GP-5 screen or Valeton Suite. They show the same names (Q4). Record what the screen shows,
character for character.

**Method: rounds on one scratch preset.** One body read captures all 10 blocks at once, so each round sets
*every* block to its category's next unvisited effect, saves, and reads. The largest category sets the number of
rounds: AMP has 32, N->S has 1 + the factory SnapTone list + the user slots, and CAB has 20 cabinets + 20 User IR slots. That comes to
roughly 35-60 reads in total, instead of ~150 single-effect reads. Categories that run out of entries simply stay
on their last effect, since a repeated row is harmless.

1. **Setup and one-off checks (do these first):**
   - a. Pick a user preset slot you can overwrite as scratch, and note its number. Every row's `source` is
     `'<date> preset <slot> round <n>'`.
   - b. **Unsaved-edit check (open part of Q4):** change one block's effect on the pedal *without saving* and read
     the preset. Did the read show the new effect or the saved one? Write the answer down. If the read shows the
     unsaved change, you can skip the save in step 2. Otherwise, save every round.
   - c. **Preset 0 baseline:** read preset 0 unchanged. For every one of the 10 chain positions, record the
     module category and name shown on the pedal: `NR - PRE - DST - N->S - AMP - CAB - EQ - MOD - DLY - RVB`. These
     give the R4 rows plus the unrecorded block 0.
   - d. **Slot byte diffs (User IR and SnapTones):** set the CAB block to User IR and read. Change only the IR slot
     to 1, 2, and 20, reading after each change, and diff the 4 raw bytes. If byte 2 (or any byte) changes with the
     slot, the slot is part of the code, and **all 20 slots** must be captured, one row per slot. Do the same for
     N->S: select two factory SnapTones and two user-imported SnapTones, diff the bytes, and note which slots are
     factory and which are user-imported, and whether an import can overwrite a factory slot.
   - e. **Reorder check (R25, R26):** on the scratch preset, read once. Move one block to a different position on
     the pedal (for example, move MOD before AMP), save if 1b requires it, and read again. Record both reads in full,
     including the probe's REC_ORDER bytes. Did the moved block's 4 code bytes stay at the same block index with only
     REC_ORDER changing, or did the REC_MODELS records themselves move? If blocks cannot be reordered at all, record
     that instead. R26 is then marked uncapturable, and the user decides whether to drop it.
2. **Rounds.** For round n = 0, 1, 2, …: set each block to entry n of its category list (below), save if step 1b
   requires it, and read with the probe. For every populated block, record: block index, chain position, the 4
   raw bytes, and the category and title shown. With T2's button, one click copies all rows.
3. **Anything the pedal does not offer** (a manual title missing from the pedal's list): record it as a
   `GP5_UNCAPTURABLE_FX` reason. Anything the pedal offers that is *not* below (for example, extra SnapTones):
   capture it, because R20/R21 append it.

Per-category checklist (manual order; tick each once captured):

| Category | Count | Effects |
| -------- | ----- | ------- |
| NR | 1 | Gate |
| PRE | 10 | COMP, COMP4, Boost, Micro Boost, B-Boost, Toucher, Crier, OCTA, Pitch, Detune |
| DST | 10 | Green OD, Yellow OD, Super OD, SM Dist, Plustortion, La Charger, Darktale, Sora Fuzz, Red Haze, Bass OD |
| N->S | 1 + factory SnapTones + user slots | Empty, plus every factory SnapTone in the pedal's N->S list (the manual pp.37-39 list is a cross-check; the pedal's own list is authoritative), plus one capture per user-imported SnapTone slot, recorded as `User SnapTone` with the file name in `pedalDisplayName`. |
| AMP | 32 | Tweedy, Bellman 59N, Dark Twin, Foxy 30N, J-120 CL, Match CL, L-Star CL, UK 45, UK 50JP, UK 800, Bellman 59B, Foxy 30TB, SUPDual OD, Solo100 OD, Z38 OD, Bad-KT OD, Juice R100, Dizz VH, Dizz VH+, Eagle 120, EV 51, Solo100 LD, Mess DualV, Mess DualM, Power LD, Flagman+, Bog RedV, Classic Bass, Foxy Bass, Mess Bass, AC Pre1, AC Pre2 |
| CAB | 20 + User IR | TWD CP 1x8, Dark VIT 1x12, Foxy 1x12, L-Star 1x12, Dark CS 2x12, Dark Twin 2x12, SUP Star 2x12, J-120 2x12, Foxy 2x12, UK GRN 2x12, UK GRN 4x12, Bog 4x12, Dizz 4x12, EV 4x12, Solo 4x12, Mess 4x12, Eagle 4x12, Juice 4x12, Bellman 2x12, AMPG 4x10, User IR (all 20 slots if step 1d says slots differ) |
| EQ | 5 | Guitar EQ 1, Guitar EQ 2, Bass EQ 1, Bass EQ 2, Mess EQ |
| MOD | 8 + 3? | A-Chorus, B-Chorus, Jet, N-Jet, O-Phase, M-Vibe, V-Roto, Vibrato, plus O-Trem, Sine Trem, Bias Trem if the pedal offers them (manual p.33) |
| DLY | 10 | Pure, Analog, Slapback, Sweet Echo, Tape, Tube, Rev Echo, Ring Echo, Sweep Echo, Ping Pong |
| RVB | 10 | Air, Room, Hall, Church, Plate L, Plate, Spring, N-Star, Deepsea, Sweet Space |

Every chain position always holds the same category (NR, PRE, and so on), so the rounds change effects *within*
each category. Moving blocks around is only needed in step 1e.

## Discarded alternatives

1. **Reorder `GP5_MODULE_FX_TITLES[c]` in place so `[cat][fxlow]` indexes the right title** (the acceptance's
   literal wording). Rejected for three reasons:
   - `cat` does not identify the category, so reordering *within* a category cannot fix it.
   - `fxlow` values such as `0x100000` are not array indices.
   - Moving titles would re-index `GP5_FX_CATALOG`, the FX browser, and every `gp5Fx.c<c>.f<i>` i18n key.

   The user accepted the lookup design at Q1/Q2 on 2026-09-28.
2. **Infer an arithmetic rule** from samples. Rejected. With exhaustive capture, a rule adds nothing the table
   does not already give, and a wrong rule reintroduces silent mislabels. A later refactor may still derive one
   and use the table as its oracle.
3. **Fall back to feature 10's positional mapping for uncaptured codes.** Rejected. It is known to produce wrong
   names, and a raw code is the honest neutral state.
4. **Change the codec to emit semantic `moduleType` strings.** Rejected. `encodeBody` round-trips `moduleType` to
   bytes, so semantic strings would lose unknown codes and turn a vocabulary fix into a protocol change.

## Deferred / remaining questions

- **Feature 16 overlap (Q6), deferred to the user by their decision.** The working tree has uncommitted feature
  16 changes to `gp5-fx-catalog.ts`, `gp5-sysex-preset-codec.ts`, and all five UI spec files this feature
  edits. The user will resolve the ordering last. No `set-depends-on` has been recorded. The implementer must not
  start while those feature 16 changes are uncommitted in the same files; if they are, block and ask.
- **Feature 15 (`gp5_mod_tremolo_vocabulary`) is closed as absorbed by this spec** (user/leader decision,
  2026-09-28). R20 plus the MOD row of the T1 checklist covers everything feature 15 asked for: confirming the
  tremolo codes on hardware, and adding them to the vocabulary, the catalog, and the i18n files.
- **Code meaning tied to block/position:** T1 steps 1c and 1e plus R9 settle this. If it holds, a spec amendment
  is needed (see "Error paths").
- **Showing real imported SnapTone names:** deliberately out of scope (see "SnapTones"). It is a candidate
  follow-up feature, not an open question for this spec.

## Hardware steps an implementer cannot perform

- T1 (captures) and T19 (browser confirmation on preset 0) can only be done by Ricardo.
- If T1's data is not available when the implementer claims, the implementer must `append-log` a blocker and
  stop. It must never invent rows.

## Testing approach

All tests are plain Vitest with no TestBed, except the existing UI specs being re-pointed.

- `gp5-hardware-captures.spec.ts`:
  - R2 and R3 checks on every row,
  - R4 checks the three literal rows,
  - R9 groups rows by `moduleType` and names any conflicting code.
- `gp5-module-vocabulary.spec.ts`:
  - R5: iterate every canonical pair and assert it is covered by a table entry or by `GP5_UNCAPTURABLE_FX`.
  - R6, R8.
  - R10: `it.each(GP5_HARDWARE_CAPTURES)`, with each case titled by `source` + block, which satisfies "cite the
    source dump".
  - R11-R14, R17, R18.
  - R19: a literal snapshot of feature 10's arrays as prefixes.
  - R21: N->S index 0 is still `'Empty'`, the last N->S entry is `'User SnapTone'`, and every N->S capture's
    title is in the list.
  - R22: every capture row with a `pedalDisplayName` in N->S has `pedalFxTitle === 'User SnapTone'`.
  - R26: group rows by preset `source` base, and assert that some hardware code appears at two different
    `chainPosition` values.
- `gp5-fx-catalog.spec.ts`:
  - R15 with `cat7_fx4` → Dark Twin's names,
  - R16 with an absent code,
  - R23: every appended title has a catalog entry; SnapTone entries use `Gain, VOL, Bass, Middle, Treble` on
    page 23.
- `gp5-sysex-preset-codec.spec.ts`: R25. Use feature 18's `buildBodyWithModels` helper plus a non-identity
  REC_ORDER built from T1 step 1e's real order bytes, then assert that each chain slot's `describeModuleType`
  equals that of its referenced block. This is a new test only; the codec logic is unchanged.
- `i18n-parity.spec.ts` (existing) plus one new assertion that every appended `descriptionKey` resolves in both
  languages (R24).
