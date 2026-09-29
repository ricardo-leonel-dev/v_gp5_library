---
feature_number: 19
name: gp5_module_vocabulary_hardware_re_verification
title: GP-5 module vocabulary: hardware re-verification of FX ordering (T17 closure)
status: spec_ready
created_at: 2026-09-28T21:30:43.000Z
updated_at: 2026-09-29T05:02:13.000Z
---

## Description
F18 (gp5_codec_rec_models_byte_layout) was closed on 2026-09-28 with the finding that the codec's REC_MODELS byte interpretation is CORRECT and matches the valeton-gp50 reference. The FX title mismatch Ricardo reported is NOT a codec bug — it is a VOCABULARY bug.

Ricardo captured a real GP-5 preset 0 ('TL DLX AMP') dump via progress/gp5_webmidi_body_read_probe.html on 2026-09-28 and confirmed the per-block content against the GP-5 screen:

chain[1] block 1 bytes [0x00,0x00,0x00,0x00] -> PRE/COMP (manual says NR/Gate)
chain[4] block 3 bytes [0x04,0x00,0x00,0x07] -> AMP/Dark Twin (manual says MOD/O-Phase)
chain[5] block 4 bytes [0x00,0x00,0x10,0x0a] -> CAB/User IR (manual says invalid)

The codec's byte interpretation is correct (it produces the literal cat/fxlow values); the vocabulary in gp5-module-vocabulary.ts maps those values to titles per the manual's per-category FX ordering, but at least AMP and CAB have a different internal numbering on the real GP-5 vs the manual. The vocabulary file's own header at lines 5-22 already flagged this as 'not independently verified against real GP-5 hardware yet. T17 in tasks.md is the human-hardware follow-up that closes this gap.' T17 was never executed.

F19 captures enough real-hardware data (multiple presets, diverse FX) to fully rebuild GP5_MODULE_FX_TITLES with the GP-5's actual per-category FX ordering, removes the T17 caveat from GP5_MODULE_VOCABULARY_STATUS, and adds regression tests pinning each category's FX-to-title mapping against captured data. This is what feature 14's review2 (M6/M7) also depended on — getting it right closes multiple downstream issues at once.

## Acceptance
- [ ] Capture at least 3 more diverse preset dumps from the GP-5 via progress/gp5_webmidi_body_read_probe.html (cover at least 5 different AMP models, 3 different PRE models, 2 different CAB models, 1 MOD, 1 DLY, 1 RVB; aim for presets that exercise multiple categories to cross-check the cat/fxlow byte mapping)
- [ ] Build a per-category mapping table: for each category c in 0..9, list every observed (fxlow, actual_GP5_title) pair from the captured data
- [ ] Rebuild GP5_MODULE_FX_TITLES in src/app/midi/gp5-module-vocabulary.ts so that GP5_MODULE_FX_TITLES[c][fxlow] matches the GP-5's actual ordering (titles stay per the manual pp.20-36; only the index-to-title mapping may shift if GP-5 reorders)
- [ ] Add regression tests in src/app/midi/gp5-module-vocabulary.spec.ts pinning each category's index-to-title mapping against the captured data, with comments citing the source preset dump for each row
- [ ] Update GP5_MODULE_VOCABULARY_STATUS to remove 'not verified against real GP-5 hardware' caveat for the FX-ordering aspect; remaining HYPOTHESIS status (if any) must be specifically justified
- [ ] Tick T17 in specs/gp5_module_vocabulary_decoding/tasks.md and reference the captures used
- [ ] Ricardo confirms in the browser that the AMP, PRE, and CAB blocks on preset 0 show the correct FX titles (Dark Twin, COMP, User IR respectively)
- [ ] ./init.sh verde (187+ tests, no regressions)
