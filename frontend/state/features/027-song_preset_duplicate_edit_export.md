---
feature_number: 27
name: song_preset_duplicate_edit_export
title: Duplicate, visually edit and export a preset inside a song
status: pending
created_at: 2026-10-02T20:49:22.000Z
updated_at: 2026-10-02T20:49:43.000Z
---

## Description
Inside a saved song, the user can duplicate one of its presets (the copy must get a different name: preset names are unique within a song), edit it visually (modules, params, bypass on the chain board), and then either export it as an installable .prst file or write it directly to a pedal slot if the GP-5 is connected. Requires a verified body encoder (encodeBody is currently unverified) and a backend card to add/replace/delete presets within an existing song (to be proposed when this spec is drafted).

## Acceptance
- [ ] Duplicating a preset in a song creates an independent copy with a unique name within that song
- [ ] Visual edits change only the copy and are persisted to the song only on explicit save
- [ ] Exported .prst installs and works on a real GP-5 in any slot (manual hardware check)
- [ ] If the pedal is connected, the edited preset can be written to a user-chosen slot; nothing is written automatically
- [ ] Plan limits on presets per song are respected
- [ ] Strings translated via Transloco (es/en parity); usable at 375px and 1280px
