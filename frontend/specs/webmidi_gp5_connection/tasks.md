# Tasks — webmidi_gp5_connection

- [x] T1 (R1, R10) Add `PedalConnectionState` type to `src/app/midi/pedal-connection.ts`. In
  `WebMidiPedalConnection`, add the `stateSignal`/`connectionState` (readonly) signal pair initialized to
  `'not-connected'`, and make the class `@Injectable({ providedIn: 'root' })`.
- [x] T2 (R5) Add the exported `GP5_NAME_PATTERN` regex constant (with the "provisional, see
  `specs/webmidi_gp5_connection/design.md`" comment) and the private `findGp5Port` helper to
  `WebMidiPedalConnection`.
- [x] T3 (R2) Implement the `isSupported()` guard at the top of `connect()`: throw
  `new Error('unsupported')` and return before calling `navigator.requestMIDIAccess` when unsupported.
- [x] T4 (R3, R4) Implement the `'connecting'` state transition and the
  `navigator.requestMIDIAccess({ sysex: true })` call.
- [x] T5 (R8) Implement the `try`/`catch` around `requestMIDIAccess`: on rejection, set the state to
  `'error'` and throw `new Error('midi_access_denied')`.
- [x] T6 (R5, R6, R7) Implement the port search using `findGp5Port` against `access.inputs`/
  `access.outputs`: on a full match, store the input/output references, register `onstatechange`
  listeners, and set the state to `'connected'`; on no match, set the state to `'error'` and throw
  `new Error('gp5_not_found')`.
- [x] T7 (R9) Implement `handlePortStateChange`: when a stored port's `state` becomes `'disconnected'`
  while the connection state is `'connected'`, clear the stored input/output references and set the
  state to `'not-connected'`.
- [x] T8 (R1, R2, R3, R4, R5, R6, R7, R8, R9, R10) Add `connect()` tests to
  `web-midi-pedal-connection.spec.ts` covering: initial state; unsupported-browser rejection without
  calling `requestMIDIAccess`; the `'connecting'` transition; `{ sysex: true }` passed to
  `requestMIDIAccess`; `requestMIDIAccess` rejection → `'error'`; no matching ports found → `'error'`;
  matching input+output found → `'connected'` and resolves; a stored port's `onstatechange` firing with
  `state: 'disconnected'` while connected → back to `'not-connected'`.
- [x] T9 (R11, R12) Create `PedalConnectionPage` (`src/app/pedals/pedal-connection-page/`): inject
  `WebMidiPedalConnection`, render the unsupported message when `isSupported()` is `false`, otherwise a
  connect control, the translated `connectionState` label, and any `error()` message.
- [x] T10 (R11, R12) Add the guarded `pedal` route to `src/app/app.routes.ts`, lazy-loading
  `PedalConnectionPage`, mirroring the existing `songs` route.
- [x] T11 (R11, R12) Add the `pedal.*` namespace (`title`, `connect`, `state_not_connected`,
  `state_connecting`, `state_connected`, `state_error`, `unsupported`, `midi_access_denied`,
  `gp5_not_found`) to both `public/i18n/en.json` and `public/i18n/es.json`.
- [x] T12 (R11, R12) Add `PedalConnectionPage` tests (`TestBed`, reusing `appConfig.providers`,
  overriding `WebMidiPedalConnection` with a fake) covering: unsupported message shown instead of the
  connect control when `isSupported()` is `false`; clicking connect calls `connect()` and reflects the
  resulting state; a rejected `connect()` renders the mapped error message.
