---
session_id: 22
feature: gp5_preset_body_read_pc_plus_slot_byte
agent: leader -> implementer (MiniMax-M3)
started_at: 2026-09-30T07:53:55.000Z
closed_at: 2026-09-30T08:18:08.000Z
---

## Plan
- Restore PC + READ_SETTLE_MS in web-midi-pedal-connection.readPresets
- Adjust gp5-sysex-preset-codec.ts header comment about PC + slot byte coexistence
- Rewrite 7 orchestration tests in web-midi-pedal-connection.spec.ts to expect per-slot PC + settle
- Restore advanceTimersByTimeAsync(READ_SETTLE_MS) and READ_SETTLE_MS import in preset-browser-page.spec.ts
- Verify with ./init.sh and write handoff

## Log
- [leader -> implementer (MiniMax-M3)] Restored PC + READ_SETTLE_MS handshake in web-midi-pedal-connection.readPresets; updated codec header comment about PC + slot byte coexistence (next edit pending)
- [leader -> implementer (MiniMax-M3)] All 794 tests pass; ./init.sh green except for the pre-existing best-effort Supabase [WARN] HTTP 404 PGRST125 (same as F19)

## Next Step

## Verification
./init.sh green end-to-end: 17 test files, 794 tests passed (same count as F19/F20 closure). The only non-test output is the pre-existing Supabase [WARN] bootstrap_project sync failed: HTTP 404 PGRST125 — same warning that has been firing since feature 19's run, not an F22 regression.

## Closure
F20 overreached by removing the per-slot MIDI Program Change + 300ms settle handshake that the GP-5 hardware requires; F20's slot-byte fix at buildBodyRequest was correct (regression test still pins decoded[2] === slot for all 100 body requests), but the body requests didn't get a reply without PC + settle. F22 restores the PC + settle on top of buildBodyRequest so both mechanisms coexist (slot byte = wire format, PC + settle = protocol handshake). The new 'waits READ_SETTLE_MS after the Program Change' orchestration test pins the PC-then-settle-then-body ordering so any future regression of the F22 wiring fails tests. Honest gap: hardware spot-check of 3 distinct presets against the pedal screen is Ricardo's responsibility before the original F19/F20 'all 100 cards show preset 0' bug is fully closed in production — see impl doc 'Honest gap' section.
