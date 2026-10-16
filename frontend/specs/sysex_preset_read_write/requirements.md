# Requirements — sysex_preset_read_write

Scope: implement `WebMidiPedalConnection.readPresets()` and `.writePreset()` (both currently stubbed as
"not implemented yet — see the sysex_preset_read_write feature", per `feature webmidi_gp5_connection`),
on top of the already-implemented `connect()`/`connectionState` signal. The SysEx byte-level encoding is
kept behind a `SysexPresetCodec` black-box interface (see `design.md`) — **the actual byte-level format
reverse-engineered by `github.com/drewmerc302/valeton-gp50`, and that project's license, are an open
question requiring human research; see `design.md`'s "Open question" section.** Requirements below are
written so `WebMidiPedalConnection`'s orchestration logic (state guards, message routing, accumulation,
timeout, error paths) is fully specified and testable against a fake codec, independent of that open
question. Out of scope: the UI that lets a user browse/save presets (`preset_browser_ui`,
`save_preset_dialog`, `import_preset_to_pedal` features) and bank/slot selection UI
(`pedal_bank_selector_ui`) — this feature only touches `src/app/midi/`.

## R1
The system SHALL define a `Preset` domain type representing a full GP-5 signal chain: a preset name, a
pedal slot index, and an ordered list of module entries each carrying a module type, an enabled flag, and
a map of numeric parameters.

## R2
The system SHALL define a `SysexPresetCodec` interface exposing methods to build the SysEx message(s)
needed to request every preset from the pedal, to decode a single incoming SysEx message into a decoded
preset, an "ignored" result, or an "invalid" result, and to build the SysEx message(s) needed to write a
given `Preset` to the pedal.

## R3
IF `readPresets()` is called while `connectionState()` is not `'connected'` THEN the system SHALL reject
the returned promise with an error identifying the connection as not established, without sending any
SysEx message.

## R4
IF `writePreset()` is called while `connectionState()` is not `'connected'` THEN the system SHALL reject
the returned promise with an error identifying the connection as not established, without sending any
SysEx message.

## R5
IF `readPresets()` or `writePreset()` is called while another call to either method on the same
connection is still pending THEN the system SHALL reject the new call's promise with an error identifying
a request already in progress, without sending any SysEx message.

## R6
WHEN `readPresets()` is called while connected and no other call is pending, the system SHALL send every
SysEx message returned by the codec's read-all-request builder to the connected `MIDIOutput`, in order.

## R7
WHEN a message decoded by the codec identifies a preset while a `readPresets()` call is awaiting
responses, the system SHALL append that preset to the call's accumulated result list, in the order the
messages were received.

## R8
WHEN a message decoded by the codec identifies itself as the last preset of the dump while a
`readPresets()` call is awaiting responses, the system SHALL resolve that call's promise with the
accumulated result list, in the order the messages were received.

## R9
IF no message decodes as the last preset of the dump within the read timeout (see `design.md`) after a
`readPresets()` call sends its request THEN the system SHALL reject that call's promise with a timeout
error.

## R10
IF a message decoded by the codec while a `readPresets()` call is awaiting responses is identified as
invalid THEN the system SHALL reject that call's promise with an error identifying the response as
invalid.

## R11
The system SHALL ignore any incoming MIDI message whose codec decode result is neither a decoded preset
nor an invalid result.

## R12
WHEN `writePreset(preset)` is called while connected and no other call is pending, the system SHALL send
every SysEx message returned by the codec's write-request builder for that `preset` to the connected
`MIDIOutput`, in order.

## R13
WHEN all messages for a `writePreset()` call have been sent to the `MIDIOutput`, the system SHALL resolve
that call's returned promise.

## R14
The system SHALL provide a `Gp5SysexPresetCodec` class implementing `SysexPresetCodec` whose
`encodeReadAllRequest` and `decodeIncomingMessage` methods implement the SysEx read protocol confirmed
against real GP-5 hardware and documented in this feature's design (see `design.md`'s "Open question").

## R17
The system SHALL make `Gp5SysexPresetCodec.encodeWriteRequest` build the write packet stream (write
command, `[0x11,0x4F,slot,0,0,0]` header, `prst[NAME_OFF:]` payload, 19-byte chunking, CRC-8/0x07 per
packet) per the GP-5 write-payload shape corroborated in this feature's design (see `design.md`'s "Open
question", point 4), with the header comment stating plainly that this is corroborated (real GP-5 write
succeeded; packet count matched prediction) rather than byte-instrumented.

## R15
The system SHALL make `WebMidiPedalConnection` obtain its `SysexPresetCodec` via Angular dependency
injection through a dedicated injection token, with `Gp5SysexPresetCodec` provided as the application's
default implementation of that token.

## R16
WHERE any code in this feature's files is adapted from `github.com/drewmerc302/valeton-gp50`, the system
SHALL include a header comment at the top of that file stating the source project's license and
confirming its compatibility with this project's own license/distribution terms.
