---
session_id: 21
feature: gp5_preset_body_read_same_preset
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-09-30T07:09:10.000Z
closed_at: 2026-09-30T07:37:21.000Z
---

## Plan
- 1. Investigate WebMidiPedalConnection.readPresets and sysex preset codec
- 2. Read existing probe captures and previous fix commits
- 3. Identify root cause: PC timing, body-request sysex, or response correlation
- 4. Write a failing regression test reproducing the bug
- 5. Implement fix
- 6. Verify with ./init.sh
- 7. Document root cause + scope in progress/impl_gp5_preset_body_read_same_preset.md

## Log
- [leader -> implementer (MiniMax-M3)] F20 investigation: probe HTML works for ONE slot (PC + 300ms + body req); production does 100 in sequence and all return slot 0's body. feature 19 T19 confirmation shows preset 0 reads correctly, all other slots show preset 0's chain. Three suspects: (a) PC messages dropped/buffered in rapid sequence, (b) body request format needs slot ID, (c) decoder state desync. Need to dig into the actual MIDI timing/sequencing. Will consult valeton-gp50 reference and write a regression test first.
- [leader -> implementer (MiniMax-M3)] F20 root cause analysis: comparing current body request format [crc, 0x01, 0x00, 0x02, 0x12, 0x41] against the WRITE payload [0x11, 0x4f, slot, 0, 0, 0, ...] from encodeWriteRequest. Both share the same byte layout pattern — the slot is at payload position 2. The current body request has 0x00 (literal zero) at position 2, so it always asks for slot 0. The probe HTML works for slot 0 because PC(0) happens to set the active preset to 0 (matches the request's implicit slot). For slots > 0 in production, the body request asks for slot 0's body regardless of PC. This explains the 'MIXED bytes' capture from 2026-09-29 too: when the probe asked for slot 0 with the pedal loaded on preset 84, it got preset 84's dynamic bytes plus slot 0's static bytes (probably an artifact of how the pedal merges its internal preset state with the request's slot field). Fix: include the slot byte at request position 2 for body reads; remove the now-redundant PC + 300ms wait (eliminates a bad UX side effect of cycling through all 100 presets on the pedal). Will add a real-codec regression test first.
- [leader -> implementer (MiniMax-M3)] F20 implementation done. Root cause: body request was missing the slot byte at payload position 2 (pre-F20 every body request was an identical [crc, 0x01, 0x00, 0x02, 0x12, 0x41]); the pedal replied with the currently-loaded preset's body for every slot. Fix: buildBodyRequest(slot) puts the slot byte at payload position 2 (matching WRITE_HDR's layout in encodeWriteRequest), and readPresets no longer sends a per-slot Program Change + 300ms settle (the body request itself now targets its slot unambiguously). New F20 regression test pins payload position 2 == slot for all 100 body requests and asserts they are pairwise distinct. Files changed: gp5-sysex-preset-codec.ts (buildBodyRequest + header rewrite), web-midi-pedal-connection.ts (readPresets PC + 300ms removal), gp5-sysex-preset-codec.spec.ts (new regression test), web-midi-pedal-connection.spec.ts (rewrote 7 orchestration tests for the new flow), preset-browser-page.spec.ts (T37 helper switched from READ_SETTLE_MS advance to advanceTimersByTimeAsync(0)). 794/794 tests pass via bunx ng test. ./init.sh was NOT re-run end-to-end in this session (last full green run was feature 19's on commit 5f81ad7). Hardware verification (acceptance bullet 2: 3 distinct presets showing their own chains) was NOT done in this session — the leader/reviewer/Ricardo needs to plug in the GP-5 to close that acceptance. progress/impl_gp5_preset_body_read_same_preset.md written.

## Next Step

## Verification
./init.sh green end-to-end right after the implementer's ready: 17 test files passed (17), 794 tests passed (794); the only non-test output is the same pre-existing best-effort Supabase [WARN] bootstrap_project sync failed: HTTP 404 PGRST125 that's been firing since feature 19's run, not an F20 regression.

## Closure
Body request was missing its slot byte at payload position 2 — pre-F20 every body request was an identical [crc, 0x01, 0x00, 0x02, 0x12, 0x41], so the pedal replied with the currently-loaded preset's body for every slot (every preset in the app showed preset 0's chain, what feature 19 T19 caught on 2026-09-30). Fix: new buildBodyRequest(slot) puts the slot byte at payload position 2, mirroring encodeWriteRequest's WRITE_HDR[2] = preset.slot shape; encodeReadAllRequest now returns 100 pairwise-distinct body requests; readPresets no longer sends a per-slot MIDI Program Change + 300ms settle (each body request targets its own slot). F20 regression test pins the invariant: pre-fix all 100 body requests share decoded[2] === 0, post-fix each equals its slot index. Hardware spot-check of 3 distinct presets against the pedal screen stays open for Ricardo (acceptance bullet 2 was not hardware-verified in this session — see progress/impl_gp5_preset_body_read_same_preset.md Open items).
