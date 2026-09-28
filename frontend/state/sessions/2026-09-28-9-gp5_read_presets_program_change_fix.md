---
session_id: 9
feature: gp5_read_presets_program_change_fix
agent: unknown
started_at: 2026-09-28T07:02:41.000Z
closed_at: 2026-09-28T07:20:43.000Z
---

## Plan
- Add SysexPresetCodec.encodeProgramChange(slot) and isAwaitingNames() to the interface + Gp5SysexPresetCodec impl
- Restructure WebMidiPedalConnection.readPresets() into an async per-slot loop: send names request, wait for names phase to finish, then per slot send PC(slot) + 300ms settle + body request + wait for that slot's decoded preset
- Replace the single flat READ_TIMEOUT_MS deadline with a per-step READ_STEP_TIMEOUT_MS that resets on every progress signal (names chunk or body chunk received)
- Document (code comment + handoff) that the pedal is deliberately left on slot 99 after a full read, not restored
- Update gp5-sysex-preset-codec.ts header comment to reflect what's now unit-tested vs still only probe-verified
- Rewrite web-midi-pedal-connection.spec.ts read-orchestration tests for the new PC+settle+body sequencing using fake timers, add per-step timeout test, add new codec tests for encodeProgramChange/isAwaitingNames
- Run ./init.sh with node v22.23.2 on PATH and fix any failures
- append-log progress and write progress/impl_gp5_read_presets_program_change_fix.md handoff

## Log
- [unknown] Added SysexPresetCodec.encodeProgramChange(slot) and isAwaitingNames() to the interface + Gp5SysexPresetCodec (plain [0xC0, slot] PC, and a namesChunks!==null query so WebMidiPedalConnection can detect when the names phase is done without changing decodeIncomingMessage's tested 'ignored' behavior).
- [unknown] Restructured WebMidiPedalConnection.readPresets() into an async per-slot loop: send names request -> wait for isAwaitingNames()==false -> for each slot: send PC(slot), await READ_SETTLE_MS=300ms, send body request, wait for that slot's decoded preset. Replaced the single flat READ_TIMEOUT_MS with READ_STEP_TIMEOUT_MS (5000ms) that resets on every message processed for the current step (names-phase chunk or body chunk), so no cumulative 100-slot deadline exists.
- [unknown] Documented in code + handoff: the pedal is deliberately left on slot 99 (the last slot read) after a full dump, not restored -- readPresets() never captures which slot was active before it's called (no query-current-slot request in the protocol), so any restore target would be an arbitrary guess.
- [unknown] Updated gp5-sysex-preset-codec.ts header comment to separate what's byte-confirmed against real hardware (framing/CRC/selectors, plus the PC-then-settle sequence demonstrated by the probe script) from what's new production wiring covered only by unit tests with fake timers, not re-verified end-to-end against the real pedal.
- [unknown] Rewrote web-midi-pedal-connection.spec.ts's FakeCodec with two separate decode-result queues (namesDecodeResults vs decodeResults) after discovering a self-inflicted test hang: a single shared queue let names-phase probe messages consume body-phase preset results early. Added new orchestration tests (PC-before-body order, settle timing, per-step timeout independent of a global deadline, deadline reset on progress) and added encodeProgramChange/isAwaitingNames unit tests to gp5-sysex-preset-codec.spec.ts without touching any existing test.
- [unknown] ./init.sh green: 88 tests pass (ng test / vitest via @angular/build:unit-test). Note: step 6 (Postgres/Supabase mirror sync) prints a pre-existing [WARN] (HTTP 404 bootstrap_project sync failed) unrelated to this feature -- present before this change too.

## Next Step

## Verification
./init.sh green: 88/88 tests pass (ng test / Vitest via @angular/build:unit-test), run with node v22.23.2 on PATH. Existing SysEx byte-level tests (CRC, framing, name/body decode) confirmed unmodified.

## Closure
readPresets() now sends a Program Change (0xC0, slot) + 300ms settle before each per-slot body request, matching the hardware-verified probe sequence, fixing the always-on read_timeout on real GP-5 hardware. Replaced the single flat 5s READ_TIMEOUT_MS with a per-step READ_STEP_TIMEOUT_MS that resets on progress instead of bounding the whole 100-slot read. Pedal is deliberately left on slot 99 after a full read, documented in code + handoff. Reviewer approved (progress/review.md).
