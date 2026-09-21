---
feature_number: 4
name: save_preset_dialog
title: Save a preset as a song (name, artist, cover, extra config)
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-21T04:19:29.000Z
---

## Description
Form to name the song, optionally set an artist and cover image, add free-form extra config, and submit to the backend's song_crud_api as a multipart upload including the raw preset bytes (and IR/NAM files if the preset references any). Mobile + desktop responsive.

## Acceptance
- [ ] Submitting creates a song on the backend with the exact preset bytes read from the pedal
- [ ] Works at a mobile viewport width (e.g. 375px) and at desktop width without layout breakage
- [ ] Validation errors (e.g. missing name) show inline, translated via Transloco
