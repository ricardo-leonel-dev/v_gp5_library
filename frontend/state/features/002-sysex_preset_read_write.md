---
feature_number: 2
name: sysex_preset_read_write
title: Port the reverse-engineered SysEx read/write protocol
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-22T08:01:26.000Z
---

## Description
Implement readPresets()/writePreset() in WebMidiPedalConnection using the SysEx message format reverse-engineered by github.com/drewmerc302/valeton-gp50. Check that project's license before copying/adapting any of its code, and note the license choice in this file's header comment.

## Acceptance
- [ ] readPresets() returns every preset currently on the pedal with its full signal chain
- [ ] writePreset() round-trips: write a preset, read it back, and confirm it matches
- [ ] The license of any adapted code is checked and documented in a comment at the top of the file it lands in
