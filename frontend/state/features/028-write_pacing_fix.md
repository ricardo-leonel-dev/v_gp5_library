---
feature_number: 28
name: write_pacing_fix
title: Add select+settle+pacing to WebMidiPedalConnection.writePreset
status: done
created_at: 2026-10-06T16:23:24.000Z
updated_at: 2026-10-07T05:59:07.000Z
---

## Description
GP-5 writePreset (sysex_preset_read_write / feature 2) currently sends the 26 write packets in a burst with no `encodeSelectPreset` and no settling time. The read path was iteratively fixed (F12/F20/F22/F24) to require `encodeSelectPreset(slot)` + 300ms `READ_SETTLE_MS` before each body read — but the write path was never retuned. F2's design only corroborated the write protocol shape (header, chunking, count) via passive sniffing of Valeton Suite, never by calling its own writePreset() on real hardware. F5's T4 manual round-trip just exposed this — writePreset() resolves successfully but the GP-5 never receives the data because it isn't in receive mode and the 26 packets arrive faster than it can process them.

The fix mirrors the read path: before the 26-packet burst, send `encodeSelectPreset(targetSlot)` + wait `READ_SETTLE_MS` (or a longer write-specific settle if needed). Between the 26 packets, add a small per-packet delay (start with 20-50ms, tune from there). Optionally consider a final commit/settle after the last packet.

F5 remains `in_progress` with this feature in its `depends_on`; F5 only closes after this fix is shipped AND F5's R49 hardware round-trip produces 3 byte-identical SHA-256 hashes (T4).

## Acceptance
- [ ] writePreset calls encodeSelectPreset(preset.slot) before sending the 26-packet write burst; writePreset delays >=300ms after selectPreset (matching READ_SETTLE_MS) so the GP-5 enters receive mode; writePreset delays between each of the 26 packets (start with 30ms; tune to whatever makes T4 pass); unit tests in web-midi-pedal-connection.spec.ts cover the new sequence (mock the codec + assert that selectPreset is sent first, the 300ms wait happens, and the 26 packets are sent with per-packet delays); the existing R2 / R12 / R13 / R14 acceptance of sysex_preset_read_write still holds (no other behavior change); F5 T4 manual hardware round-trip produces 3 byte-identical SHA-256 hashes (captured body == saved body == read-back body), verifying the fix end-to-end on Ricardo's GP-5.
