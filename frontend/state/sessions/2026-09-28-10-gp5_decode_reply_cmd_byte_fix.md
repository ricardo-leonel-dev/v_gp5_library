---
session_id: 10
feature: gp5_decode_reply_cmd_byte_fix
agent: unknown
started_at: 2026-09-28T07:49:03.000Z
closed_at: 2026-09-28T07:59:43.000Z
---

## Plan
- Remove the incorrect cmd!==CATSEL gate in decodeIncomingMessage(); document decoded[1] as per-transfer chunk count
- Update class header comment with feature 13 hardware finding
- Fix gp5-sysex-preset-codec.spec.ts fixtures to use realistic chunk-count values instead of hardcoded CATSEL
- Add new unit tests for chunk-count-based acceptance (names/body) and CRC-invalid rejection
- Add full end-to-end integration test wiring the real Gp5SysexPresetCodec into WebMidiPedalConnection for all 100 slots
- Run ./init.sh and verify all green

## Log
- [unknown] Removed the 'cmd !== CATSEL' gate in Gp5SysexPresetCodec.decodeIncomingMessage(); decoded[1] is a per-transfer chunk count (106 for names, 25 for body per hardware capture), never a fixed command byte. Added inline comment documenting this at the point where decoded[1] was previously read.
- [unknown] Updated the class header comment block with a new bullet describing the feature 13 hardware finding and what was fixed.
- [unknown] Fixed gp5-sysex-preset-codec.spec.ts: buildReply/chunkForReassembly now build a realistic per-transfer chunkCount at decoded[1] (matching Math.ceil(blob.length/19), which naturally reproduces 106/25 for names/body blobs) instead of hardcoding CATSEL 0x12 there. Added a new describe block asserting names/body phases decode correctly with real chunk-count values and that CRC-invalid messages are still rejected.
- [unknown] Added a full end-to-end regression test in web-midi-pedal-connection.spec.ts wiring the REAL Gp5SysexPresetCodec (not FakeCodec) into WebMidiPedalConnection, driving 106 names-phase frames + 100 slots x 25 body frames each through the real Program-Change-and-settle sequencing (feature 12), asserting all 100 presets decode with correct slot/name/chain.
- [unknown] Ran ./init.sh with node v22.23.2 on PATH: verification command (ng test) passed, 92/92 tests green. Only a pre-existing [WARN] on the Postgres/Supabase mirror sync step (unrelated to this feature).

## Next Step

## Verification
./init.sh green: 92/92 tests passed (ng test / Vitest), run with node v22.23.2 on PATH; only a pre-existing unrelated [WARN] on the Postgres/Supabase mirror sync (HTTP 404 PGRST125).

## Closure
Removed the incorrect 'cmd !== CATSEL' gate in Gp5SysexPresetCodec.decodeIncomingMessage() that discarded every real GP-5 reply; decoded[1] is documented as the per-transfer chunk count (106 names / 25 body), never a fixed command byte. Fixed spec fixtures that had accidentally hardcoded CATSEL at that position, added unit tests for the corrected acceptance logic, and added a full end-to-end regression test wiring the real codec through WebMidiPedalConnection across all 100 slots. Reviewer independently verified the gate removal, unchanged CRC/write-path logic, and that the new tests would fail against the old gate.
