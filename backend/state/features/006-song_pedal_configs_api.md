---
feature_number: 6
name: song_pedal_configs_api
title: POST/GET/DELETE /songs/:id/pedals — private per user+song
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T08:33:47.000Z
---

## Description
A user's own knob/button configuration of a shared pedal_catalog entry, for one specific song. Private to the owning user+song even though pedal_catalog_id points at a shared row.

## Acceptance
- [ ] POST /songs/:id/pedals attaches a pedal_catalog_id with a label + config to a song the caller owns
- [ ] Attempting this on a song owned by another user returns 404
- [ ] GET only ever returns the caller's own song_pedal_configs, never another user's for the same pedal_catalog_id
