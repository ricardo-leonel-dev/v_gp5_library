---
feature_number: 5
name: import_preset_to_pedal
title: Write a saved song's preset back to the pedal
status: in_progress
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-10-07T06:01:42.000Z
---

## Description
Pick a saved song from the user's library and call PedalConnection.writePreset() with its exact stored bytes.

## Acceptance
- [ ] The pedal ends up with a preset byte-identical to what was originally saved
- [ ] A clear success/failure state is shown after the write completes

## Notes
- 2026-10-02T20:19:35.000Z [leader] SCOPE NOTE 2026-10-02: a song owns 1..N ordered presets (independent copies). Writing to the pedal means choosing which preset(s) of the song to send and the target slot; the stored origin pedal_slot is only a suggested default, never enforced.
- 2026-10-02T21:05:45.000Z [leader] CORRECTION 2026-10-02: no origin slot is stored at all (pedal_slot dropped). The user chooses any target slot freely; installing the same preset in many slots is allowed. Supersedes the earlier 'suggest origin slot' note.
