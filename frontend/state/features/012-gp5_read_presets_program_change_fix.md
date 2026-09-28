---
feature_number: 12
name: gp5_read_presets_program_change_fix
title: Fix readPresets(): missing per-slot Program Change + settle causes real-hardware read_timeout
status: done
created_at: 2026-09-28T07:01:32.000Z
updated_at: 2026-09-28T07:20:43.000Z
---

## Description
readPresets() (WebMidiPedalConnection + Gp5SysexPresetCodec, from feature 2 sysex_preset_read_write) sends all 100 body-read requests (selector 0x41) immediately with no MIDI Program Change and no settle delay between them. Real GP-5 hardware requires, per slot: send a Program Change (0xC0, slot) to select the slot, wait ~300ms to settle (see progress/gp5_webmidi_body_read_probe.html's POST_PC settle step, matching scan_bank.py/select_patch.py), then send the body request (0x41), which reads whichever slot is currently selected on the device. Confirmed via a live hardware test: connecting the pedal and loading presets through the UI now hangs and times out (read_timeout) because this sequencing is missing from the shipped implementation, even though the byte-level framing was separately hardware-verified. Additionally, READ_TIMEOUT_MS (5000ms) is one flat deadline for the entire 100-slot read; even after adding the required ~300ms settle per slot, 100 slots need well over 5s total, so the timeout strategy needs to change from a single deadline for the whole operation to something that resets/extends on progress.

## Acceptance
- [ ] readPresets() sends a MIDI Program Change (0xC0, slot) before requesting each slot's body, waits for the pedal to settle (~300ms, matching the verified probe script), then requests the body -- for all 100 slots, in order
- [ ] The read operation is not bounded by a single flat 5s timeout for all 100 slots -- timeout handling resets/extends on progress instead of one global deadline
- [ ] A per-slot/per-step timeout still rejects with a clear error if the pedal stops responding mid-read
- [ ] Existing SysEx byte-level tests (CRC, framing, name/body decode) still pass unmodified -- this fix is about request sequencing/timing, not the codec's byte format
- [ ] New tests cover: Program Change sent with the correct slot number before each body request in slot order (fake timers for the settle delay), and a stalled slot still times out correctly
- [ ] The implementer documents (code comment + handoff) whether the pedal's active slot is restored after a full read or deliberately left on slot 99, with the tradeoff noted
