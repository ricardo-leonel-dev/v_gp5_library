# Requirements — `import_preset_to_pedal` (feature 5)

Write a saved song's preset back to the GP-5. From a saved song (1..N ordered presets in the user's account), the
user picks **which preset(s) of the song to send** and a **target slot on the pedal** for each, the app fetches
the exact stored `.prst` bytes from the backend, and calls `PedalConnection.writePreset()` with the original body
and name field. The pedal ends up with a preset **byte-identical** to what was originally saved. The whole action
is explicit, scoped, and shows a clear success / failure state.

A saved song never carries a stored origin slot (`pedal_slot` was dropped, see F4 Rev 4 + SCOPE NOTE 2026-10-02
CORRECTION); the user freely picks any target slot, and may install the same preset in many slots.

Ground truth: `specs/save_preset_dialog/{requirements,design}.md` (F4, `done`) — the F4 contract this feature
builds on, especially F4 §1 (`.prst` layout, `encodePrstFile` / `decodePrstFile` / `isReadablePrstNameField`) and
F4 §0 dependency 1 (`GET /songs/:id/files/preset?sort_order=N` returns the full 507-byte `.prst` file, `done`).

Out of scope (deferred to F27 / later features): duplicating a preset under a new name before writing, editing a
saved preset's bytes, exporting saved presets, mass-installing every preset of every song, scheduling writes,
writing a `.prst` file from disk straight to the pedal (the F4 "Add .prst file" flow already handles the
local-only case), changes to `POST /songs`, changes to the read path.

## Decisions (former open questions — resolved by the F4 Rev 4/5 backend contract)

- **OD1 — slot range.** RESOLVED: 100 slots numbered `0..99`. Confirmed by the read protocol's 100-slot dump
  (`progress/gp5_webmidi_read_probe.html`) and by MIDI CC0 `[0xb0, 0x00, slot]` (F24, page 40 of the user manual).
  The picker offers exactly the integers `0..99`. No other limits apply — the user is installing onto their own
  pedal.
- **OD2 — multi-preset writes (one song to consecutive slots).** RESOLVED: in scope as an **optional** flow
  alongside per-preset writes — the SCOPE NOTE explicitly says "Writing to the pedal means choosing which
  preset(s) of the song to send and the target slot". A song with N presets can be installed into any
  user-chosen set of target slots, one per song preset, in song order (R28-R32). Mismatched counts (presets ≠
  slots) are blocked at submit (R33).
- **OD3 — fetch surface.** RESOLVED: the backend already exposes
  `GET /songs/:id/files/preset?sort_order=N` returning the full 507-byte `.prst` file (F4 §0 dependency 1;
  verified `index.test.ts:664-722` and `song-service.test.ts:546+`). F5 adds a typed client
  (`SongsApi.getSongPreset`) and uses the bytes verbatim.
- **OD4 — entry point.** RESOLVED: a **"Send to pedal"** action on each song card on the library page
  (`/songs`), opening a **single-purpose dialog** that lists the song's presets in `sortOrder` order, lets the
  user pick one (single) OR the full set in order (multi), and asks for the target slot(s). F26 owns the
  detail page; F5 does not duplicate it.
- **OD5 — byte identity vs. the codec.** RESOLVED: today's `encodeBody` re-synthesizes a 466-byte body from
  `preset.chain` and zeros the per-block `(fxlow, cat)` and the parameter records
  (`gp5-sysex-preset-codec.ts:344-394, 387-388`). It is **not** byte-identical today even with `raw` set.
  **F5 fixes `encodeWriteRequest` to use `preset.raw.body` verbatim when present** (R42-R46). With this fix and
  the protocol mechanics already corroborated (header, 19-byte chunking, CRC-8/SMBUS, `cmd 0x1D`), the pedal's
  resulting preset is the exact bytes that were originally saved.

## Preset raw bytes (already shipped, F4)

## R1
The system SHALL treat the `Preset.raw` (`body: Uint8Array`, `nameField: Uint8Array`) fields added by F4 as the
authoritative source of a saved preset's bytes: `body` (466 bytes) is the body to write to the pedal;
`nameField` (16 bytes) is the verbatim name record the pedal will display.

## R2
The system SHALL NOT re-synthesize a 466-byte body from `preset.chain` when writing a saved preset whose
`raw.body` is present.

## Domain shape (saved song → write)

## R3
WHEN the user activates the "Send to pedal" action (`data-testid="song-card-send-to-pedal"`) on a song card on
the library page, the system SHALL open the write dialog with the song's `id` and its presets ordered by
`sortOrder` ascending.

## R4
WHILE the write dialog is open, the dialog SHALL keep using the song `id` and the ordered preset list it was
opened with, even if the library's `GET /songs` response changes afterwards.

## R5
The system SHALL address a preset inside a song by `(songId, sortOrder)`; `sortOrder` is the 0-based position
in the song's ordered preset list (F26 R31, `SongPreset.sortOrder`).

## Preset bytes fetcher

## R6
WHEN the dialog needs the bytes for a preset, the system SHALL send exactly one
`GET ${apiBaseUrl}/songs/<songId>/files/preset?sort_order=<sortOrder>` request with `responseType: 'blob'`.

## R7
WHEN the request of R6 responds `200`, the system SHALL treat the response body as a 507-byte `.prst` file and
pass it to `decodePrstFile`.

## R8
IF `decodePrstFile` rejects the bytes THEN the system SHALL NOT call `writePreset` and SHALL show the dialog's
failure state with `writeToPedal.errors.corruptFile` (`data-testid="write-to-pedal-failure"`).

## R9
IF the R6 request fails with HTTP `404` THEN the system SHALL show `writeToPedal.errors.songNotFound` in the
failure state.

## R10
IF the R6 request fails with HTTP `401` THEN the system SHALL show `writeToPedal.errors.sessionExpired` in the
failure state together with a link to `/login`.

## R11
IF the R6 request fails with a network error (status `0`) THEN the system SHALL show
`writeToPedal.errors.network` in the failure state.

## R12
IF the R6 request fails in any way not covered by R8-R11 THEN the system SHALL show
`writeToPedal.errors.unexpected` in the failure state.

## Preset construction

## R13
WHEN `decodePrstFile` accepts the bytes, the system SHALL build a `Preset` object for `writePreset` with
`slot` equal to the user's chosen target slot, `name` equal to `decoded.name`, `chain` equal to
`decoded.chain`, and `raw` equal to
`{ body: bytes.subarray(0x29, 0x29 + 466).slice(), nameField: bytes.subarray(0x19, 0x29).slice() }`
(two fresh `Uint8Array` slices; `raw.body` length 466, `raw.nameField` length 16).

## R14
The system SHALL pass the R13 `Preset` to `pedalConnection.writePreset(preset)`, never a reconstructed one
without `raw`.

## Target slot picker

## R15
The dialog SHALL offer a target-slot picker (`data-testid="write-to-pedal-slot-input"`) that lets the user
enter an integer in `[0, 99]`.

## R16
WHILE the picker holds a non-integer value, the dialog SHALL render the "Send" button
(`data-testid="write-to-pedal-submit"`) disabled.

## R17
WHILE the picker holds an integer outside `[0, 99]`, the dialog SHALL show the inline message
`writeToSlot.errors.outOfRange` next to the picker and keep the "Send" button disabled.

## R18
The dialog SHALL default the picker to `0` when it opens.

## R19
The dialog SHALL render the picker as a label + numeric input plus a "0..99" range hint (`writeToSlot.help`)
underneath; the input uses `inputmode="numeric"` and `pattern="[0-9]*"` so the on-screen keyboard on mobile is
numeric.

## Write mode (single vs multi-preset)

## R20
The dialog SHALL offer a "write all in order" control (`data-testid="write-to-pedal-write-all"`) that, when
active, treats the dialog as a multi-preset write: the song's N presets, in `sortOrder` order, are sent to
consecutive target slots starting at the picker's value.

## R21
WHILE the "write all in order" control is active and the song has N presets, the dialog SHALL require the
picker to hold an integer M with `M + N - 1 <= 99`; otherwise the picker shows
`writeToSlot.errors.notEnoughRoom` with `{N, available: 99 - M + 1}` and the "Send" button is disabled.

## R22
WHILE the "write all in order" control is active, the dialog SHALL show an inline summary of the resulting slot
range (`writeToSlot.summary_range` with `{from, to}`) below the picker, derived from `M` and `N`.

## R23
WHEN the "write all in order" control is deactivated, the dialog SHALL return to single-preset mode
(R15-R19): the picker accepts one integer in `[0, 99]` and the dialog only sends the picked preset.

## R24
The dialog SHALL default to single-preset mode (R23) and the "write all in order" control inactive.

## Submit (pedal connection gate)

## R25
WHILE `connectionState` is not `connected`, the dialog SHALL render a "Connect to GP-5" reminder
(`data-testid="write-to-pedal-not-connected"`, `role="status"`) and disable the "Send" button.

## R26
WHILE `connectionState` is `connected`, the dialog SHALL NOT make any connection attempt itself.

## R28
WHEN the user activates the "Send" button in single-preset mode (R23), the system SHALL fetch the bytes of the
picked preset (R6) and call `pedalConnection.writePreset(preset)` (R13-R14) exactly once with target slot M.

## R29
WHEN the user activates the "Send" button in multi-preset mode (R20-R22), the system SHALL fetch the bytes of
every preset in `sortOrder` order and call `pedalConnection.writePreset(preset)` exactly once per preset, with
target slots `M, M + 1, …, M + N - 1`, in that order.

## R30
The dialog SHALL issue R28 / R29 sequentially: the next fetch starts only after the previous `writePreset`
resolves (or rejects).

## R31
WHILE a write is in flight, the dialog SHALL disable the "Send" button and show the label
`writeToPedal.writing` (`data-testid="write-to-pedal-submitting"`) in place of `writeToPedal.send`.

## R32
WHILE a write is in flight, the dialog SHALL ignore Escape and backdrop clicks; the dialog stays open until
the operation completes (R36-R41).

## R33
The dialog SHALL NEVER send fewer presets than the song has, or to overlapping slots, in a single submit (R21 /
R28 / R29 enforce it before submit; this R33 is the gate).

## R34
WHILE `connectionState` transitions from `connected` to `not-connected` / `error` between the user's "Send"
activation and the next `writePreset` call (R30), the dialog SHALL keep the queued writes, show
`writeToPedal.errors.connectionLost` in the failure state, and abort the remaining writes.

## Outcome (single)

## R36
WHEN `writePreset` resolves after a single-preset write (R28), the dialog SHALL replace the form with the
success panel (`data-testid="write-to-pedal-success"`) showing `writeToPedal.success_single` with
`{toSlot: M, presetName}`, and a "Close" button (`data-testid="write-to-pedal-close"`).

## R37
IF `writePreset` rejects in a single-preset write THEN the dialog SHALL keep the form (preset list, picker,
write-all toggle) so the user can retry, and SHALL show the failure state (`data-testid="write-to-pedal-failure"`)
with the key mapped from the rejection's `message`: `not_connected` → `writeToPedal.errors.pedalDisconnected`;
`request_in_progress` → `writeToPedal.errors.busy`; `read_timeout` → `writeToPedal.errors.timeout`; anything
else → `writeToPedal.errors.unexpected`.

## Outcome (multi)

## R38
WHEN all N `writePreset` calls of a multi-preset write (R29) resolve, the dialog SHALL replace the form with
the success panel showing `writeToPedal.success_multi` with `{from: M, to: M + N - 1, count: N, songName}`.

## R39
IF one `writePreset` rejects mid-sequence (R29) THEN the dialog SHALL stop issuing further writes (R30),
surface the failure state with the mapped key (R37) on the failing slot, and list the slot numbers already
written in `writeToPedal.partialProgress` (a comma-separated list under the failure banner). The user can
retry from the form (R37) starting at the failing slot.

## R40
The dialog SHALL NOT roll back any successful preceding write — only state the partial progress; the user
decides whether to redo them.

## R41
The dialog SHALL re-enable the "Send" button when the user dismisses the failure banner and returns to the
form (R37).

## Codec write path — use `raw.body` verbatim

(R42-R46 are the precondition for byte identity, OD5. See `design.md` §1.)

## R42
WHEN `Gp5SysexPresetCodec.encodeWriteRequest(preset)` receives a `preset` whose `raw` is present and whose
`raw.body.length === 466`, the system SHALL copy `preset.raw.body` verbatim into
`payload.subarray(WRITE_HDR.length + NAME_LEN)` and SHALL NOT call `encodeBody(preset.chain, …)`.

## R43
WHEN `encodeWriteRequest(preset)` receives a `preset` whose `raw` is absent or whose `raw.body.length !== 466`,
the system SHALL keep today's behavior: encode the name from `preset.name` into the 16-byte name slot
(NUL-padded) and call `encodeBody(preset.chain, …)`.

## R44
WHEN `encodeWriteRequest(preset)` writes the name slot, the system SHALL copy `preset.raw.nameField` verbatim
into the 16-byte name slot when `preset.raw?.nameField.length === 16`, regardless of the body branch
(R42 / R43).

## R45
The 6-byte `WRITE_HDR` (`[0x11, 0x4F, slot, 0, 0, 0]`), the `cmd 0x1D` opcode, the 19-byte chunking and the
CRC-8/SMBUS calculation per packet SHALL be unchanged from today's `encodeWriteRequest`.

## R46
IF `encodeWriteRequest` is called with a `preset` whose `raw.body` length is not 466 but whose `raw` is
present (impossible through the UI, but reachable through a buggy caller) THEN the system SHALL throw
`Error('preset_bytes_unavailable')` so the failure is loud rather than silent.

## Tests (proof of byte identity)

## R47
The system SHALL add an end-to-end test (`gp5-sysex-preset-codec.spec.ts` or a new
`write-preset-bytes.spec.ts`) that:
1. starts from a captured 466-byte body fixture (`src/app/midi/gp5-captured-bodies.fixture.ts`) and a captured
   16-byte name field for the same slot (or constructs one via `encodePrstFile` round-trip);
2. calls `encodeWriteRequest({ slot: S, name: '…', chain, raw: { body, nameField } })`;
3. asserts the bytes `payload[22..22+466)` equal `body` byte-for-byte and `payload[6..22)` equal `nameField`.

## R48
The system SHALL add a unit test (`gp5-sysex-preset-codec.spec.ts`) that, with a synthesized `Preset` whose
`raw` is absent, asserts `encodeWriteRequest` still calls `encodeBody` and produces the same bytes as today
(the "fallback" branch of R43).

## R49
The implementer SHALL run the **manual hardware test** on a real GP-5 before `mark-spec-ready`: connect to the
pedal, install a known preset (capture its body via the read path), save it as a song via the F4 dialog, read
the bytes back, write them to a slot, read that slot's body via the script
`progress/gp5_webmidi_backup_all.html`, and assert the read-back 466 bytes are byte-identical to the saved
ones. The captured body, the saved body, and the read-back body are appended to
`progress/impl_import_preset_to_pedal.md` as SHA-256 hashes (no raw bytes). If the round-trip is not
byte-identical, stop and report for a spec revision — do not soften the acceptance.

## i18n, layout, theme

## R50
The system SHALL keep the set of key paths under the `writeToPedal` and `writeToSlot` namespaces identical
between `public/i18n/en.json` and `public/i18n/es.json`, each with a non-empty string value.

## R51
The dialog backdrop, card, picker, mode toggle, submit button and success panel SHALL carry the layout class
strings given in `design.md` → "Visual direction" (centered `max-w-md` card at all viewports; no bottom sheet
distinction — the dialog is small), verified by class assertions in a component test and by a manual check at
375px and 1280px with no overlap or cut-off.

## R52
Every color class on the dialog's surfaces, text, picker, buttons, mode toggle, write-all summary, failure
banner and success panel SHALL have the `dark:` counterpart given in `design.md` → "Visual direction", verified
by class assertions and by a manual dark-mode check.

## R53
The song-card "Send to pedal" button SHALL be a `type="button"` inside the card, with `click.stopPropagation()`
so it does not trigger the card's navigation (F26 R25).

## R54
WHILE the library page's `GET /songs` request is pending or has failed, the library page SHALL render the song
cards without the "Send to pedal" action visible (the page shows only the loading / error / empty states — the
list itself is the source of the action).