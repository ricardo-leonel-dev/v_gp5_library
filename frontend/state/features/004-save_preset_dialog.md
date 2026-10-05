---
feature_number: 4
name: save_preset_dialog
title: Save a preset as a song (name, artist, cover, extra config)
status: in_progress
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-10-05T06:52:56.000Z
---

## Description
Form to name the song, optionally set an artist and cover image, add free-form extra config, and submit to the backend's song_crud_api as a multipart upload including the raw preset bytes (and IR/NAM files if the preset references any). Mobile + desktop responsive.

## Acceptance
- [ ] Submitting creates a song on the backend with the exact preset bytes read from the pedal
- [ ] Works at a mobile viewport width (e.g. 375px) and at desktop width without layout breakage
- [ ] Validation errors (e.g. missing name) show inline, translated via Transloco

## Notes
- 2026-10-02T18:41:30.000Z [leader] PREP 2026-10-02: refined brief at progress/f4_brief.md (coverage check: no acceptance item already met; raw preset bytes currently discarded -> must be retained in src/app/midi). User decisions: upload rebuilt 507-byte .prst; IR/NAM optional guided picker by detected User IR/SnapTone slots; extra_config as key/value list. Evidence: progress/explore_f4_frontend.md, progress/explore_f4_backend_contract.md. spec_author must use the brief's refined acceptance.
- 2026-10-02T20:19:35.000Z [leader] CROSS-PROJECT DEP: multi-preset upload needs backend feature multiple_presets_per_song_with_per_preset_reference_metadata (notion_page=https://app.notion.com/p/Multiple-presets-per-song-with-per-preset-reference-metadata-3eddef9a37cd81ea952dccc2d5cdf68e); block on claim if not done. Old backend card 'Song pedal slot + replace preset endpoint' is discarded.
- 2026-10-02T20:39:06.000Z [leader] OQ1 RESOLVED 2026-10-02 by leader with real Valeton export v_gp5_library/external_docs/02-TLDLXAMP.prst: 507 bytes; header 47502d35 + 14x00 + 01 + 00 (01 at 0x12, probe recipe had it at 0x13); CRC-8/0x07 init0 over 0x15..end = 0x10 at 0x14 verified; sentinel 0x15-0x18; name 0x19; body 0x29. Spec R8/design header/T13 updated (T13 now copies the export as a byte-for-byte fixture). Note: export body differs in 3 bytes (68,172,458) from the 2026-09-30 F24 capture of slot 0 'TL DLX AMP' — presumably edits since; not used as a byte-identity proof.
- 2026-10-02T20:49:43.000Z [leader] CROSS-PROJECT DEP #2: plan tier limits come from backend card plan_tiers_songs_and_presets_per_song_limits (https://app.notion.com/p/Plan-tiers-songs-and-presets-per-song-limits-3eddef9a37cd81c3ba06e3c04c108f6d): free 1 song x 1 preset, basic 2 songs x 2 presets, premium unlimited; 402 with machine-readable code; plan exposed via a read endpoint.
- 2026-10-02T21:05:45.000Z [leader] Revision 4 (brief): pedal_slot dropped; OQ6/OQ7 defaults accepted; OQ8 exact match after trim.
- 2026-10-05T06:40:54.000Z [leader] [leader] SPEC REVISION 5 APPROVED 2026-10-05 by Ricardo Aguilar (in conversation). Aligns spec with finished backend (dev 04eda42): nested GET /me/plan shape, pedal_preset_name withdrawn (R85), new 400 strings (R98, R108), client-side preset-name readability mirroring backend readPresetName (R109-R118, T50-T56). Counts now R=118, T=56; DB spec row still shows 107/49 because approved specs are frozen in the harness. Changelog: progress/f4_rev5_changes.md; contract: progress/f4_rev5_backend_contract.md.
