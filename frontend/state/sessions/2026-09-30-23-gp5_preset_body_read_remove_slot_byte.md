---
session_id: 23
feature: gp5_preset_body_read_remove_slot_byte
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-09-30T16:42:55.000Z
closed_at: 2026-09-30T16:52:43.000Z
---

## Plan
- Read probe HTML lines 340-345 for empirical ground truth
- Remove buildBodyRequest() function from gp5-sysex-preset-codec.ts
- Update encodeReadAllRequest to use buildRequest(BODY_SEL) for all 100 body requests
- Rewrite F20/F22 header comments to reflect new understanding + cite probe HTML + cite user manual page 40
- Update F20 regression test in gp5-sysex-preset-codec.spec.ts to assert new invariant (all 100 body requests byte-identical, byte 2 == 0)
- Run ./init.sh to verify green
- Write progress/impl_gp5_preset_body_read_remove_slot_byte.md handoff

## Log
- [leader -> implementer (MiniMax-M3)] Read probe HTML — ground truth at lines 115-119 (buildRequest(selector) → [0, 0x01, 0x00, 0x02, 0x12, selector]; byte 2 is 0x00, no slot byte) and lines 340-345 (per-slot sequence: output.send([0xc0, slot & 0x7f]) + setTimeout(300) + buildRequest(BODY_SEL)). F23 will revert F20's buildBodyRequest(slot) and let encodeReadAllRequest use buildRequest(BODY_SEL) for all 100 body requests.
- [leader -> implementer (MiniMax-M3)] F23 implementation complete: buildBodyRequest removed; encodeReadAllRequest uses buildRequest(BODY_SEL) for all 100 byte-identical body requests; F20 regression test updated to assert new invariant (byte 2 = 0x00 in every body request, set size = 1). ./init.sh green — 17 test files, 794 tests pass. Supabase mirror [WARN] is pre-existing best-effort, same as F19/F20/F22 logged.
- REVIEW (changes-requested): F23 protocol revert is correct, but web-midi-pedal-connection.ts lines 112-129 + 138-143 still describe F22's slot-byte+PC coexistence framing and reference buildBodyRequest (now removed) — comment block is factually wrong against the new ground truth.
- [leader -> implementer (MiniMax-M3)] F23 reviewer flagged stale comments in web-midi-pedal-connection.ts; fixed per review.md. Pre-loop comment (was lines 112-129) rewritten to describe the F23 protocol (body request byte-identical for every slot, slot travels only on MIDI Program Change, PC + settle is the load-bearing piece). Post-loop comment (was lines 138-143) updated to reference F23 as the feature that re-established PC + settle. Code logic unchanged. ./init.sh still green — 17 test files, 794 tests pass.

## Next Step

## Verification
./init.sh green end-to-end: 17 test files, 794 tests passed. Round 1 reverted F20's buildBodyRequest(slot) and switched encodeReadAllRequest to buildRequest(BODY_SEL) — 100 byte-identical body requests, byte 2 = 0x00 each; F20 regression test inverted to assert the new invariant (set size 1, decoded[2] === 0x00). Round 2 was comment-only — web-midi-pedal-connection.ts pre-loop (lines 112-130) and post-loop (lines 139-146) comments updated to drop the F22 'coexistence' framing and reflect F23's empirical protocol (PC + READ_SETTLE_MS is the load-bearing piece; slot travels only on the MIDI Program Change; progress/gp5_webmidi_body_read_probe.html lines 115-119 and 340-345 cited as ground truth). The only non-test output is the same pre-existing Supabase [WARN] bootstrap_project sync failed: HTTP 404 PGRST125 — same warning since feature 19's run, unrelated to F23.

## Closure
F20's 'slot byte at payload position 2' hypothesis was disproven by Ricardo's hardware test (timeout — the pedal doesn't respond to body requests with a stray byte at position 2); F22's coexistence (slot byte + PC + settle) also timed out for the same reason. F23 reverts to buildRequest(BODY_SEL) for all 100 body requests (byte-identical, byte 2 = 0x00) on top of F22's PC + 300ms settle handshake — the protocol the empirical single-slot probe at progress/gp5_webmidi_body_read_probe.html (lines 115-119 for buildRequest, 340-345 for the per-slot PC -> 300ms -> body sequence) uses. The original '100 cards show preset 0's chain' bug remains unfixed — that's F24's scope (race condition investigation with hardware captures).
