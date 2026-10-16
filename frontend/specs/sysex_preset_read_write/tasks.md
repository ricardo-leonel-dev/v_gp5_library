# Tasks — sysex_preset_read_write

- [x] T1 (R1) Add `Preset`/`PresetSlot` types to `src/app/midi/preset.ts`.
- [x] T2 (R2, R15) Add `SysexPresetCodec` interface, `SysexDecodeResult` type, and the
  `SYSEX_PRESET_CODEC` injection token to `src/app/midi/sysex-preset-codec.ts`.
- [x] T3 (R14, R16, R17) Add `Gp5SysexPresetCodec` to `src/app/midi/gp5-sysex-preset-codec.ts`:
  `encodeReadAllRequest`/`decodeIncomingMessage` implement the real, GP-5-hardware-confirmed read protocol
  (crc8, nibble framing, selectors `0x40`/`0x41`, `prst_format.py`'s `REC_MODELS`/`REC_BYPASS`/
  `REC_ORDER`/`REC_PARAMS` body layout); `encodeWriteRequest` implements the GP-5-corroborated write
  protocol (R17, see T21). Header comment carries the MIT copyright/permission notice (R16) plus a precise
  statement of what's byte-confirmed (read) vs. corroborated-not-byte-instrumented (write).
- [x] T4 (R14, R17) Add `gp5-sysex-preset-codec.spec.ts`: `encodeReadAllRequest`/`decodeIncomingMessage`
  tests against known request/response byte fixtures (from the confirmed probe runs); `encodeWriteRequest`
  tests asserting the packet stream's shape (cmd `0x1D`, header, 19-byte chunking, CRC, 26 blocks for a
  GP-5-sized preset) matches the corroborated structure from T21.
- [x] T5 (R14, R16) **UNBLOCKED for read** (see `design.md`'s "Open question", points 2-3): implement
  `Gp5SysexPresetCodec`'s real `encodeReadAllRequest`/`decodeIncomingMessage`, using the request/reply
  framing and body-record layout confirmed against real GP-5 hardware (`crc8`, nibble framing, selectors
  `0x40`/`0x41`, `prst_format.py`'s `GP5` profile: 466-byte body, `REC_MODELS`/`REC_BYPASS`/`REC_ORDER`/
  `REC_PARAMS` magics — all reproduced in `progress/gp5_webmidi_body_read_probe.html`'s successful run).
  `encodeWriteRequest` stays a throwing `'protocol_unconfirmed'` stub for now — see `T21`. Update the
  header comment with the MIT copyright/permission notice (R16) plus what was verified against the GP-5
  (cite the probe runs) instead of asserting anything about the still-unconfirmed write path.
- [x] T21 (R17, R16) **UNBLOCKED — corroborated against real GP-5 hardware** (see `design.md`'s "Open
  question", point 4): implement `Gp5SysexPresetCodec.encodeWriteRequest` building `PATCH_WRITE_CMD`
  (`0x1D`) packets with payload `[0x11,0x4F,slot,0,0,0] + prst[NAME_OFF:]`, chunked into 19-byte blocks,
  each CRC-8/0x07-checksummed — the GP-50 encoding, ported as-is. Corroboration: Ricardo imported a patch
  into a real GP-5's scratch slot via Valeton Suite (after a full backup via
  `progress/gp5_webmidi_backup_all.html`) while `progress/gp5_webmidi_write_capture.html` passively
  captured the device's ACK stream — the pedal's sound/config audibly changed, and exactly 26 device ACKs
  arrived, matching the GP-5 payload's predicted block count (488 bytes / 19 = 26 blocks) to the byte.
  The write opcode/header bytes themselves were not directly observed (Web MIDI can't see another app's
  outgoing traffic) — header comment must say "corroborated via real-hardware effect + block-count match,
  not byte-instrumented," not assert direct confirmation.
- [x] T6 (R1) Update `src/app/midi/pedal-connection.ts`: change `readPresets(): Promise<unknown[]>` to
  `Promise<Preset[]>` and `writePreset(preset: unknown)` to `writePreset(preset: Preset)`.
- [x] T7 (R15) Inject `SYSEX_PRESET_CODEC` into `WebMidiPedalConnection` and provide
  `{ provide: SYSEX_PRESET_CODEC, useClass: Gp5SysexPresetCodec }` in `src/app/app.config.ts`.
- [x] T8 (R3, R4) Add the `connectionState() !== 'connected'` guard at the top of both `readPresets()` and
  `writePreset()`, each throwing `new Error('not_connected')` before sending anything.
- [x] T9 (R5) Add the `pendingOperation` field and the "already pending" guard shared by both methods,
  throwing `new Error('request_in_progress')`.
- [x] T10 (R6) Implement `readPresets()`'s request phase: create the pending-read record (with the
  `READ_TIMEOUT_MS` timeout handle), send every message from `codec.encodeReadAllRequest()` via
  `output.send()`, and return the promise.
- [x] T11 (R7, R8, R10, R11) Extend `connect()` to wire `input.onmidimessage`, and implement
  `handleMidiMessage`: route to the pending read's `codec.decodeIncomingMessage()` result — append on
  `'preset'` (resolving and clearing the timeout if `isLast`), reject with `'invalid_response'` on
  `'invalid'`, no-op on `'ignored'` or when no read is pending.
- [x] T12 (R9) Implement the read-timeout path: reject with `new Error('read_timeout')` and clear
  `pendingOperation` when the timeout handle fires before an `isLast` message arrives.
- [x] T13 (R12, R13) Implement `writePreset()`'s send phase: set `pendingOperation` to `{ kind: 'write'
  }`, send every message from `codec.encodeWriteRequest(preset)` via `output.send()`, clear
  `pendingOperation`, and resolve.
- [x] T14 (R3, R4, R5) Add `web-midi-pedal-connection.spec.ts` tests: not-connected rejection for both
  methods with `output.send` never called; concurrent-call rejection in both directions.
- [x] T15 (R6, R12) Add tests asserting `output.send` is called once per message from
  `encodeReadAllRequest()`/`encodeWriteRequest()`, in order, using a fake `SysexPresetCodec`.
- [x] T16 (R7, R8, R11) Add tests simulating `input.onmidimessage` with scripted decode results:
  accumulates presets in order, resolves with the full list on `isLast`, and ignores `'ignored'` results
  without affecting the pending call.
- [x] T17 (R9) Add a `vi.useFakeTimers()` test advancing past `READ_TIMEOUT_MS` with no `isLast` message,
  asserting rejection with `'read_timeout'`.
- [x] T18 (R10) Add a test asserting rejection with `'invalid_response'` when a decode result is
  `'invalid'`.
- [x] T19 (R13) Add a test asserting `writePreset()` resolves once all messages are sent, without waiting
  for any input message.
- [x] T20 (R1, R6, R7, R8, R12, R13) Add the round-trip test: a fake codec backed by an in-memory
  `Map<number, Preset>` (write stores, read emits from the map); `writePreset(preset)` followed by
  `readPresets()` returns a list containing that same `preset`.