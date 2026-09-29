# Tasks — gp5_module_vocabulary_hardware_re_verification

Read design.md's "Deferred / remaining questions" before starting. Feature 15 (`gp5_mod_tremolo_vocabulary`) is
closed as absorbed by this spec (R20, T5-T7). In particular, do not start while feature 16's
uncommitted changes sit in the same files. That ordering is deferred to the user.

- [ ] T1 (R1, R4, R5, R6, R20, R21, R22, R26) **Human, Ricardo only: exhaustive capture.** Follow design.md's "T1 capture
  procedure and checklist":
  - **1a.** Pick a scratch preset slot.
  - **1b.** Unsaved-edit check: does a read show an edit that has not been saved?
  - **1c.** Preset 0 baseline: record all 10 chain positions (`NR - PRE - DST - N->S - AMP - CAB - EQ - MOD - DLY
    - RVB`) as the pedal shows them.
  - **1d.** Slot byte diffs: set the User IR slot to 1, 2, and 20 and compare the raw bytes. Compare two factory and
    two user-imported SnapTones, record which N->S slots are factory and which are user-imported, and whether an
    import can overwrite a factory slot.
  - **1e.** Reorder check: read, move one block on the pedal, and read again. Record both reads, including the
    REC_ORDER bytes. Did the code stay at its block index while only REC_ORDER changed?
  - **2.** Capture rounds until every row of the per-category checklist is ticked. This includes every SnapTone
    factory SnapTone in the pedal's N->S list, one capture per user-imported SnapTone slot (recorded as
    `User SnapTone` with the file name in `pedalDisplayName`), every User IR slot if 1d shows the slots differ, and
    the MOD tremolos if the pedal offers them.
  - **3.** Record every effect the pedal does not offer, with a reason.

  Hand over all rows (JSON from T2, or text), plus the answers to 1b, 1d, and 1e.

  Implementer: if these are not available when you claim, `append-log` a blocker and stop. Never fabricate rows.
- [ ] T2 (R1) Recommended local tooling, not graded. Add a "copy as capture rows" button to
  `progress/gp5_webmidi_body_read_probe.html`. It emits one `Gp5HardwareCapture`-shaped JSON object per populated
  block, fills in `rawBytes`, `moduleType`, `blockIndex`, and `chainPosition`, and leaves `pedalCategory` and
  `pedalFxTitle` for Ricardo to fill in. Do this **before** T1, so the ~35-60 reads are copy-paste instead of
  hand transcription.
- [ ] T3 (R1, R2, R3, R4) Create `src/app/midi/gp5-hardware-captures.ts` with the `Gp5HardwareCapture` interface
  and `GP5_HARDWARE_CAPTURES`, filled from T1.
- [ ] T4 (R2, R3, R4, R9) Create `src/app/midi/gp5-hardware-captures.spec.ts` with the fixture integrity tests.
  Run it. On an R9 conflict, stop and log a blocker, per design.md "Error paths" (possible block-index keying).
- [ ] T5 (R20, R21) Append the missing titles T1 observed to `GP5_MODULE_FX_TITLES`:
  - non-N->S titles (for example, the MOD tremolos) go at the end of their category,
  - factory SnapTone names go after `'Empty'` in N->S, in the pedal's list order, followed by one final
    `'User SnapTone'` entry,
  - spell every title exactly as the pedal shows it.
- [ ] T6 (R23) Append a matching `GP5_FX_CATALOG` entry for every title from T5. SnapTones (factory and `User SnapTone`) use
  `['Gain','VOL','Bass','Middle','Treble']` on page 23. Tremolos use their manual p.33 parameter names.
- [ ] T7 (R24) Add es/en `gp5Fx.c<c>.f<i>` descriptions for every T6 entry. Factory SnapTones paraphrase their
  manual pp.37-39 row. `User SnapTone` gets "SnapTone file imported by the user". Other entries get a
  neutral type-only description.
- [ ] T8 (R7, R8) Add `CanonicalModuleIndices` and a hand-written literal `GP5_HARDWARE_MODULE_CODES` to
  `gp5-module-vocabulary.ts`, with one entry per distinct captured `moduleType`, grouped by category.
- [ ] T9 (R5, R6) Add `GP5_UNCAPTURABLE_FX` from T1 step 3. It is empty if the pedal offers everything.
- [ ] T10 (R11, R12) Rewrite `decodeModule` to look up `GP5_HARDWARE_MODULE_CODES`, with no positional
  indexing.
- [ ] T11 (R13, R14) Add `resolveModuleIndices(moduleType)`.
- [ ] T12 (R15, R16) Switch `describeParameters` in `gp5-fx-catalog.ts` to `resolveModuleIndices`. Grep `src/`
  for any other place that indexes the canonical tables with raw `parseModuleType` output, and fix it the same
  way.
- [ ] T13 (R17, R18) Rewrite `gp5-module-vocabulary.ts`'s header and `GP5_MODULE_VOCABULARY_STATUS` as
  `HARDWARE-VERIFIED`, cite `gp5-hardware-captures`, and state that absent codes resolve raw. Record the T1
  answers to 1b (unsaved edits), 1d (User IR / SnapTone slot bytes), and 1e (reorder behaviour) in the header.
- [ ] T14 (R5, R6, R8, R10, R11, R12, R13, R14, R17, R18, R19, R21, R22, R26) Rewrite `gp5-module-vocabulary.spec.ts`
  following design.md "Testing approach":
  - R5 exhaustive-coverage test,
  - R10 `it.each` over the captures, titled by source and block,
  - R19 prefix snapshot, which replaces feature 10's R3 length test,
  - R21/R22 checks for `User SnapTone`,
  - the R26 reorder-evidence test,
  - status tests.
- [ ] T15 (R15, R16, R23, R24) Update `gp5-fx-catalog.spec.ts`: add `cat7_fx4` → Dark Twin names, an absent code
  → raw, and appended-entry checks. Extend the i18n assertion for the appended `descriptionKey`s.
- [ ] T16 (R10, R12) Re-point the hard-coded `moduleType` literals in the five `src/app/pedals/**` spec files
  listed in design.md to captured codes with the same meaning. Keep the unresolved-path literals only while they
  are still absent from the table.
- [ ] T17 (R25) Add a test to `gp5-sysex-preset-codec.spec.ts`. Build a body with feature 18's
  `buildBodyWithModels` helper and a non-identity REC_ORDER, taken from T1 step 1e's real bytes, and assert that
  every chain slot's `describeModuleType` equals that of its referenced block. Test-only, with no codec logic
  change.
- [ ] T18 (R12) Documentation updates:
  - Update only the "IMPORTANT" paragraph of `gp5-sysex-preset-codec.ts`'s header. Make no logic change, and
    confirm feature 18's REC_MODELS test is untouched and green.
  - In `specs/gp5_module_vocabulary_decoding/`, tick T17 in `tasks.md`, citing the capture sources, and add the
    "Superseded by feature 19" notes under R3, R4, and R11 in `requirements.md`.
- [ ] T19 (R4, R10) **Human, Ricardo only.** Load preset 0 in the running app and confirm:
  - PRE shows `COMP`,
  - AMP shows `Dark Twin`,
  - CAB shows `User IR 1-20`,
  - block 0 shows what T1 step 1c recorded.

  Also spot-check two other presets. Record the confirmation in `progress/impl_*.md`. Do not `log-out` until
  Ricardo confirms.
- [ ] T20 (R1-R26) Run `./init.sh`. Expect ≥ 187 tests passing with no regressions. Write the R→test
  traceability in `progress/impl_gp5_module_vocabulary_hardware_re_verification.md`.
