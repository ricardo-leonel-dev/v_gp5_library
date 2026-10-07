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
- 2026-10-07T06:16:59.000Z [leader] FOLLOW-UP from F5 (Ricardo, 2026-10-07): once the header connect button (pedal-connect) exists, remove the inline connect button from F5's write-to-pedal dialog not-connected reminder and keep only the message pointing to the header. Next feature to implement after F5.
- 2026-10-07T06:29:40.000Z [leader] DECISIONS (Ricardo, 2026-10-07) after spec audit progress/f26_spec_audit.md: (1) song card is NOT a link — the song name links to the detail page and F5's 'Send to pedal' button sits beside it; (2) KEEP F5's inline connect button in the write-to-pedal dialog (connects without navigating/reading) and reword its message so it no longer points to the header — supersedes the earlier follow-up note to remove it.
- 2026-10-07T07:02:40.000Z [leader] SPEC REVISION 3 APPROVED 2026-10-07 by Ricardo Aguilar (in conversation): 84 R / 49 T. Card = name link + send button; F5 inline connect kept with new copy (R81-R84); extends F5 code instead of rewriting; /pedal fixes deferred to F29. Implementation will be done by another model — not launched from this session.
