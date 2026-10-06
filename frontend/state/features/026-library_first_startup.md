---
feature_number: 26
name: library_first_startup
title: Song library on startup with Connect to GP-5 always visible
status: spec_ready
created_at: 2026-10-02T20:19:32.000Z
updated_at: 2026-10-05T21:30:18.000Z
---

## Description
The library is a library of SONGS (each with its ordered presets), not of presets. On app start show the user's saved songs (name, artist, cover) via GET /songs without needing the pedal; opening a song shows its presets in order with their reference metadata (pedal preset name, origin slot). The 'Connect to GP-5' button is always visible; reading the pedal only makes presets available to add to a new song (F4) - it never compares against or updates saved songs. Needs backend card multiple_presets_per_song_with_per_preset_reference_metadata for the ordered presets in the DTO.

## Acceptance
- [ ] Saved songs are listed on app start without connecting the pedal
- [ ] Opening a song shows its presets in sort order with pedal preset name and origin slot as reference only
- [ ] Connect to GP-5 is visible at all times and starts the pedal read
- [ ] Reading the pedal never compares with, flags, or modifies saved songs
- [ ] Empty library shows a clear empty state inviting to connect the pedal and save a song
- [ ] Strings translated via Transloco (es/en parity); usable at 375px and 1280px

## Notes
- 2026-10-02T20:19:35.000Z [leader] CROSS-PROJECT DEP: needs backend feature multiple_presets_per_song_with_per_preset_reference_metadata (path=/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend notion_page=https://app.notion.com/p/Multiple-presets-per-song-with-per-preset-reference-metadata-3eddef9a37cd81ea952dccc2d5cdf68e). If claimed before it is done, block with BLOCKED_ON: path=/Users/ricardoaguilar/Documents/Development/v_gp5_library/backend feature=multiple_presets_per_song_with_per_preset_reference_metadata notion_page=https://app.notion.com/p/Multiple-presets-per-song-with-per-preset-reference-metadata-3eddef9a37cd81ea952dccc2d5cdf68e. Spec drafting may proceed.
- 2026-10-02T21:05:45.000Z [leader] CORRECTION 2026-10-02: pedal_slot dropped; a song's presets show only their pedal preset name (no origin slot).
- 2026-10-05T21:27:47.000Z [leader] Backend follow-up (non-blocking) proposed and created: Notion card 'Indicate cover presence in GET /songs list' for v_gp5_library-backend (predicted name indicate_cover_presence_in_get_songs_list) https://app.notion.com/p/Indicate-cover-presence-in-GET-songs-list-3f0def9a37cd810d9a09cdbbf347a5d7 — F26 ships with per-song cover fetch + 404.
