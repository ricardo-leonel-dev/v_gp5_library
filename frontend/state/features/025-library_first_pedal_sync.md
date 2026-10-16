---
feature_number: 25
name: library_first_pedal_sync
title: Library-first startup and pedal sync with change detection
status: superseded
superseded_by: library_first_startup
created_at: 2026-10-02T19:54:08.000Z
updated_at: 2026-10-02T20:19:33.000Z
---

## Description
On app start load the user's saved songs (GET /songs) without connecting the pedal. The 'Connect to GP-5' button is always visible; clicking it starts the full pedal read. When the read finishes, compare each saved song's preset bytes with the pedal's current bytes in the same slot (pedal_slot) and, for every changed one, ask the user whether to update the saved song (PUT /songs/:id/preset) or keep it. Nothing is ever saved automatically; presets not in the library are only saved via the F4 dialog. Mock presets are never compared or uploaded. Depends on F4 save_preset_dialog and on backend card song_pedal_slot_replace_preset_endpoint.

## Acceptance
- [ ] Saved songs are listed on app start without connecting the pedal
- [ ] Connect to GP-5 is visible at all times and starts the sync
- [ ] After sync, every saved song whose slot bytes differ from the pedal is flagged and the user chooses update or keep per song
- [ ] Choosing update calls PUT /songs/:id/preset and keeps cover/IR/NAM/extra_config; choosing keep changes nothing
- [ ] No library write happens without an explicit user action
- [ ] Mock presets never trigger comparison or uploads
- [ ] Prompts and errors translated via Transloco (es/en parity); usable at 375px and 1280px

## Notes
- 2026-10-02T19:54:22.000Z [leader] CROSS-PROJECT DEP (cannot block while pending): do NOT implement until backend feature song_pedal_slot_replace_preset_endpoint is done. If claimed before that, immediately run: scripts/harness.sh block library_first_pedal_sync "waiting on v_gp5_library-backend: BLOCKED_ON: path=/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend feature=song_pedal_slot_replace_preset_endpoint notion_page=https://app.notion.com/p/Song-pedal-slot-replace-preset-endpoint-3eddef9a37cd8133ae36f59d9c1e4076". Spec drafting (claim-spec) may proceed meanwhile.
- 2026-10-02T20:19:33.000Z [leader] SUPERSEDED by 26 library_first_startup (was pending): User clarified 2026-10-02: library is of songs (each with ordered presets, independent copies); pedal slot is reference-only, so post-sync change detection/update and the PUT replace endpoint are dropped.
