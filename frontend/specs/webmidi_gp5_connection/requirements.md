# Requirements — webmidi_gp5_connection

Scope: implement `WebMidiPedalConnection.connect()` (the only piece of `PedalConnection` currently
stubbed as "not implemented yet — see the webmidi_gp5_connection feature") plus a connection-state
signal and a minimal page/UI that exercises it. This feature is entirely client-side: it talks to the
GP-5 hardware directly over USB via the Web MIDI API and never calls this project's backend REST API.
`readPresets()`/`writePreset()` (the SysEx protocol itself) are out of scope — see the
`sysex_preset_read_write` feature. A richer, shared unsupported-browser fallback component is out of
scope — see the `unsupported_browser_fallback_ui` feature; this feature only needs to satisfy
`docs/architecture.md`'s existing hard rule ("always check `isSupported()` first and show an explicit
unsupported-browser state").

## R1
The system SHALL initialize a `WebMidiPedalConnection`'s connection state to `'not-connected'` when it
is constructed, before `connect()` is ever called.

## R2
IF `connect()` is called while `isSupported()` returns `false` THEN the system SHALL reject the
`connect()` promise with an error identifying the browser as unsupported, without calling
`navigator.requestMIDIAccess`.

## R3
WHEN `connect()` is called and `isSupported()` returns `true`, the system SHALL set the connection
state to `'connecting'` before calling `navigator.requestMIDIAccess`.

## R4
WHEN `connect()` calls `navigator.requestMIDIAccess`, the system SHALL pass `{ sysex: true }` as the
options argument.

## R5
WHEN the promise returned by `navigator.requestMIDIAccess` resolves, the system SHALL search the
resulting `MIDIAccess`'s `inputs` and `outputs` for ports whose `name` matches the GP-5 identification
pattern, case-insensitively.

## R6
WHEN the search described in R5 finds both a matching input port and a matching output port, the
system SHALL store references to both matched ports, set the connection state to `'connected'`, and
resolve the `connect()` promise.

## R7
IF the search described in R5 does not find both a matching input port and a matching output port
THEN the system SHALL set the connection state to `'error'` and reject the `connect()` promise with an
error stating the GP-5 was not found.

## R8
IF the promise returned by `navigator.requestMIDIAccess` rejects THEN the system SHALL set the
connection state to `'error'` and reject the `connect()` promise with an error describing that MIDI
access could not be obtained.

## R9
WHEN a previously matched GP-5 input or output port's `state` changes to `'disconnected'` while the
connection state is `'connected'`, the system SHALL set the connection state to `'not-connected'`.

## R10
The system SHALL expose the connection state as a readonly signal whose value is one of
`'not-connected'`, `'connecting'`, `'connected'`, or `'error'`.

## R11
WHERE Web MIDI is supported (`isSupported()` returns `true`), the system SHALL render a
pedal-connection page offering a control that calls `connect()` and a translated label reflecting the
current connection-state signal value.

## R12
WHERE Web MIDI is not supported (`isSupported()` returns `false`), the system SHALL render the
pedal-connection page's explicit unsupported-browser message instead of the connect control.
