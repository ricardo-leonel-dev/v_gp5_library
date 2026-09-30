---
feature_number: 24
name: gp5_preset_read_100slot_race
title: Investigate production 100-slot preset read race — all cards show preset 0's chain
status: pending
created_at: 2026-09-30T16:43:13.000Z
updated_at: 2026-09-30T16:44:33.000Z
---

## Description
After F20/F22/F23: the app loads presets again (timeout fix), but the original bug persists — in the production 100-slot bulk read, all 100 cards show the chain of preset 0 instead of each card's own chain. The single-slot probe frontend/progress/gp5_webmidi_body_read_probe.html works fine with PC + 300ms settle + body request (no slot byte); the production sequential 100-slot loop does not. Hypotheses to verify with the GP-5 plugged in (NO implementer should be launched before this): (a) output.send(PC) is non-blocking — the body request sent 300ms later may arrive before the pedal finishes applying the PC, causing the body request to read the previous slot's body; (b) MIDI buffer overflow on the pedal with 100 PCs in rapid succession — not all PCs get applied before the body request arrives; (c) the reference implementation drewmerc302/valeton-gp50 (MIT, cited in gp5-sysex-preset-codec.ts header as the source of prst_format.py / live_read.py) may already encode the working pattern; (d) a capture-bytes diagnostic with the GP-5 plugged in and the app open is needed first to see the live behavior.

## Acceptance
- [ ] Root cause identified with captured bytes from a live GP-5 session
- [ ] Fix proposed and verified against the probe pattern at frontend/progress/gp5_webmidi_body_read_probe.html
- [ ] 3 distinct presets in the production read show their own chains in the app
- [ ] F20 and F23 reverted once the real fix lands
