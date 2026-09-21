---
feature_number: 4
name: song_file_export_import
title: GET /songs/:id/files/:kind streams bytes back losslessly
status: done
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T17:32:43.000Z
---

## Description
The whole point of storing raw files is lossless re-import to the pedal — this endpoint must return byte-identical content to what was originally uploaded, only for the owning user's songs.

## Acceptance
- [ ] A round-trip test uploads a file, downloads it via this endpoint, and asserts byte-for-byte equality
- [ ] Requesting a kind that doesn't exist for that song returns 404
- [ ] Requesting a song owned by a different user returns 404
