# Tasks — gp5_module_vocabulary_decoding

- [x] T1 (R1) Create `src/app/midi/gp5-module-vocabulary.ts` with `GP5_MODULE_CATEGORIES` (the 10-entry
  `NR..RVB` array, design.md's table, p.40).
- [x] T2 (R2, R3) Transcribe `GP5_MODULE_FX_TITLES` for all 10 categories from design.md's data table
  (verify each list against external_docs/gp-5-manual.pdf pp.20-36 while transcribing — design.md's table is
  a starting point, not a substitute for checking the PDF).
- [x] T3 (R4, R5, R6) Implement `decodeModule(cat, fxlow)` per design.md's `ModuleDescription` shape.
- [x] T4 (R7, R8) Implement `parseModuleType(moduleType)` per design.md's `MODULE_TYPE_PATTERN`/
  `ParsedModuleType`.
- [x] T5 (R9, R10) Implement `describeModuleType(moduleType)` composing T3/T4 per design.md's
  `DescribedModuleType` shape.
- [x] T6 (R11) Add the `GP5_MODULE_VOCABULARY_STATUS` exported constant, and a header comment on
  `gp5-module-vocabulary.ts` summarizing the same HYPOTHESIS status and citing external_docs/gp-5-manual.pdf
  p.40 and pp.20-36, mirroring `gp5-sysex-preset-codec.ts`'s CONFIRMED/CORROBORATED/UNCONFIRMED header
  convention.
- [x] T7 (R1) Add `gp5-module-vocabulary.spec.ts`: `GP5_MODULE_CATEGORIES` length and exact values.
- [x] T8 (R2, R3) Add tests: all ten `GP5_MODULE_FX_TITLES` array lengths match `[1, 10, 10, 1, 32, 21, 5, 8,
  10, 10]`; spot-check known first/last entries per design.md's "Testing approach".
- [x] T9 (R4) Add tests: `decodeModule` resolves known `(cat, fxlow)` pairs to the expected
  `{ category, fxTitle }`.
- [x] T10 (R5) Add a test: `decodeModule` with an out-of-table `cat` returns the raw fallback.
- [x] T11 (R6) Add a test: `decodeModule` with a known `cat` but out-of-range `fxlow` returns the raw
  fallback.
- [x] T12 (R7) Add tests: `parseModuleType` parses single- and multi-hex-digit `cat<hex>_fx<hex>` strings
  correctly.
- [x] T13 (R8) Add tests: `parseModuleType` returns `null` for the codec's `'empty'` sentinel and for an
  arbitrary non-matching string.
- [x] T14 (R9) Add a test: `describeModuleType` resolves a parseable, resolvable `moduleType` string
  end-to-end.
- [x] T15 (R10) Add tests: `describeModuleType` falls back to `{ kind: 'raw', moduleType }` for both an
  unparseable string and a parseable-but-unresolved `(cat, fxlow)` string.
- [x] T16 (R11) Add a test: `GP5_MODULE_VOCABULARY_STATUS` contains `'HYPOTHESIS'` and `'gp-5-manual.pdf'`.
- [x] T17 (done via feature 19, `gp5_module_vocabulary_hardware_re_verification`: Ricardo's 2026-09-28..30
  preset-0 reads are recorded in `src/app/midi/gp5-hardware-captures.ts`; sources `2026-09-28 preset 0 TL DLX AMP`,
  `2026-09-29 preset 0 baseline` / `1b unsaved AMP edit`, and `2026-09-30 preset 0 round 1`..`round 51`,
  `round IR13 re-read`, `round IR20`, `round 1e before` / `round 1e after`. The comparison disproved the positional
  mapping, which feature 19 replaced with a per-code lookup.) (acceptance criterion 2 — hardware round-trip verification; **not** mapped to any R above and
  **not** executable by an implementer/reviewer subagent session) Ricardo connects his real GP-5, reads a
  known factory patch through the existing `sysex_preset_read_write`/`preset_browser_ui` features, and
  compares `describeModuleType`'s resolved names for that patch's modules against what the pedal's own
  screen shows, for a representative sample of patches/modules (not just one). This task is expected to
  remain unchecked when this feature is otherwise reviewed and closed — that is not a defect in the
  implementation; per `docs/specs.md`, tasks.md tolerates an unchecked item only with a documented
  justification, and the justification here is exactly this: it requires physical hardware access nobody but
  Ricardo has. Do **not** mark this checked, fabricate a result, or skip straight to updating
  `GP5_MODULE_VOCABULARY_STATUS` to `'CONFIRMED'` without Ricardo actually having done this. Once he has,
  update `GP5_MODULE_VOCABULARY_STATUS` (R11) and its test (T16) to reflect the new CONFIRMED status,
  citing what was checked, as a small follow-up change (new commit/session, not a silent edit to this one).
