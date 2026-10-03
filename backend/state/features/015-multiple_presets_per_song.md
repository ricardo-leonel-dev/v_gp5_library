---
feature_number: 15
name: multiple_presets_per_song
title: Multiple presets per song
status: done
created_at: 2026-10-03T03:09:16.000Z
updated_at: 2026-10-03T03:21:38.000Z
---

## Description
A song is the library unit and owns an ordered set of 1..N presets (independent byte copies; the same pedal preset may be saved in many songs). Each preset carries its GP-5 preset name, read by the backend from the .prst file itself, as reference-only metadata — never used as a link to the pedal or to detect changes. No slot data is stored. Replaces the discarded card 'Song pedal slot + replace preset endpoint' (no PUT/replace endpoint is needed).

## Acceptance
- [ ] 1) POST /songs accepts 1..N 'preset' File parts; order sent = sort_order. 2) Each preset's name is read by the backend from the uploaded .prst bytes (GP-5 preset name field) and stored as reference-only metadata; the client does not send it. 400 if a preset file has no readable name. No slot data is stored. 3) Song DTO and GET /songs, GET /songs/:id return presets ordered by sort_order with their metadata. 4) Export GET /songs/:id/files/preset?sort_order=n returns each preset's raw bytes. 5) No back-compat needed (no stored data yet): the song-level pedal_preset_name column is removed, and presets are listed only in presets, not in files (which keeps ir/nam/cover). 6) No endpoint mutates presets of an existing song; plan limits unchanged (count songs, not presets).
