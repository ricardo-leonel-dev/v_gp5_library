# Requirements — preset_browser_ui

Scope: a page showing every preset read off the connected GP-5 via the already-implemented
`PedalConnection.readPresets()` (feature `sysex_preset_read_write`), reachable from the already-implemented
pedal-connection page (feature `webmidi_gp5_connection`), plus the minimal shared seam ("selecting a preset
records it as the currently selected preset") that `save_preset_dialog` (a separate, still-pending feature)
will consume later. Out of scope: the save dialog itself, its own route/UI, and any backend call
(`save_preset_dialog`); attaching a catalog pedal (`pedal_bank_selector_ui`); writing a preset back to the
pedal (`import_preset_to_pedal`); a shared unsupported-browser component
(`unsupported_browser_fallback_ui` — this feature's own inline check only needs to satisfy
`docs/architecture.md`'s existing hard rule, same as `webmidi_gp5_connection` already does for the
connection page).

## R1
The system SHALL provide a `SelectedPresetStore` whose selected-preset signal is `null` when the store is
constructed.

## R2
WHEN `SelectedPresetStore.select(preset)` is called, the system SHALL set the selected-preset signal's
value to that `preset`.

## R3
WHERE `isSupported()` returns `false` when the preset browser page is activated, the system SHALL render
the page's unsupported-browser message, without calling `readPresets()`.

## R4
WHERE `isSupported()` returns `true` and `connectionState()` is not `'connected'` when the preset browser
page is activated, the system SHALL render a translated message instructing the user to connect the pedal,
without calling `readPresets()`.

## R5
WHEN the preset browser page is activated while `isSupported()` returns `true` and `connectionState()` is
`'connected'`, the system SHALL call `readPresets()` exactly once.

## R6
WHILE the `readPresets()` call triggered by R5 is pending, the system SHALL render a translated loading
indicator.

## R7
WHEN the `readPresets()` call triggered by R5 resolves, the system SHALL render exactly one row per element
of the resolved array, in the same order as that array.

## R8
WHEN rendering a row for a given preset, the system SHALL display that preset's `slot` and `name`.

## R9
WHEN rendering a row for a given preset, the system SHALL display a signal-chain summary listing the
`moduleType` of every entry in that preset's `chain` whose `enabled` is `true`, comma-separated, in chain
order.

## R10
WHERE a preset's `chain` contains no entry whose `enabled` is `true`, the system SHALL render that preset's
signal-chain summary as the translated empty-chain placeholder string instead of an empty string.

## R11
IF the `readPresets()` call triggered by R5 rejects THEN the system SHALL render a translated error message
derived from the rejection error's `message`, without rendering any preset rows.

## R12
WHERE the `readPresets()` call triggered by R5 resolves with an empty array, the system SHALL render a
translated "no presets found" message instead of any preset rows.

## R13
The system SHALL add a guarded, lazy-loaded route mounting the preset browser page, using the same route
guard as the existing `pedal` route.

## R14
WHEN `connectionState()` is `'connected'` on the pedal connection page, the system SHALL render a link to
the preset browser page's route.

## R15
WHEN the user activates a preset row's select control, the system SHALL call
`SelectedPresetStore.select(preset)` with that row's preset.
