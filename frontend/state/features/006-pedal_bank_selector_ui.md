---
feature_number: 6
name: pedal_bank_selector_ui
title: Browse the shared pedal catalog and attach one to a song
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-21T04:19:31.000Z
---

## Description
A selector over the backend's shared pedal_catalog, letting the user attach an external pedal to the current song with a private label + config (song_pedal_configs). Reference photo shown with a Three.js hover tilt/parallax effect (no 3D asset pipeline — real 2D photos only).

## Acceptance
- [ ] The catalog list shows every pedal regardless of who added it
- [ ] Attaching a pedal to a song only ever writes to the caller's own song_pedal_configs
- [ ] Hovering a pedal's reference image shows a subtle tilt/parallax effect via Three.js
