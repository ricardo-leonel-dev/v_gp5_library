---
feature_number: 5
name: import_preset_to_pedal
title: Write a saved song's preset back to the pedal
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-21T04:19:30.000Z
---

## Description
Pick a saved song from the user's library and call PedalConnection.writePreset() with its exact stored bytes.

## Acceptance
- [ ] The pedal ends up with a preset byte-identical to what was originally saved
- [ ] A clear success/failure state is shown after the write completes
