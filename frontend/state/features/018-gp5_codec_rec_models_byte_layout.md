---
feature_number: 18
name: gp5_codec_rec_models_byte_layout
title: Diagnose and fix GP-5 chain AMP/preset title mismatch (codec REC_MODELS HYPOTHESIS)
status: done
created_at: 2026-09-28T21:01:55.000Z
updated_at: 2026-09-28T21:30:27.000Z
---

## Description
During T41 manual check of feature 16, Ricardo reported that on preset 0 (position 0) clicking the AMP block shows a different FX title than what the pedal actually has configured.

Independent investigation (progress/review_gp5_preset_chain_visual_board_review_fixes.md + adb4934449b482442 report) found NO structural bug in the rendering pipeline:
- GP5_FX_CATALOG[c].length === GP5_MODULE_FX_TITLES[c].length (R1 holds for AMP c=4: 32 entries on both sides).
- parseModuleType / describeModuleType agree; no off-by-one or cat/fxlow swap.
- fxTitle source is consistent between chain-board and block-detail (both read slot.moduleType).
- Chain permutation uses the correct block per position.

Primary suspect: src/app/midi/gp5-sysex-preset-codec.ts:225-238 reads each 4-byte REC_MODELS record as fxlow = body[0] | body[1]<<8 | body[2]<<16 (24-bit little-endian) and cat = body[3]. The file header at lines 46-61 explicitly flags this as a best-effort GP-50 port, not hardware-verified. If the real GP-5 uses a different fxlow width (16-bit? 1-byte?) or puts cat in a different byte position, the moduleType strings produced by the codec would be wrong, and describeModuleType would faithfully resolve them to wrong FX titles — exactly Ricardo's symptom.

Test gap: src/app/midi/gp5-sysex-preset-codec.spec.ts:75-90 leaves every REC_MODELS record as all zeros, so the byte-decoding logic is never exercised with non-zero values. End-to-end 'real bytes -> REC_MODELS -> moduleType -> describeModuleType -> fxTitle' has no coverage.

Capture real GP-5 preset bytes via progress/gp5_webmidi_body_read_probe.html, identify the actual byte layout, fix the codec, add end-to-end test with non-zero REC_MODELS values, re-verify T41.

## Acceptance
- [ ] Capturar bytes reales de preset 0 desde el GP-5 con el pedal conectado (vía progress/gp5_webmidi_body_read_probe.html)
- [ ] Identificar layout real de REC_MODELS (ancho de fxlow, posición de cat) — contrastar contra la suposición actual del codec
- [ ] Corregir gp5-sysex-preset-codec.ts según el layout real; documentar el cambio en el header del archivo
- [ ] Añadir test end-to-end en gp5-sysex-preset-codec.spec.ts con REC_MODELS no-cero que verifique el layout real
- [ ] Ricardo confirma en el navegador que el AMP del preset 0 muestra el título correcto
- [ ] ./init.sh verde (sin regresiones)
