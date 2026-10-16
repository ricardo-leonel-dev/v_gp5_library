# Requirements — `unsupported_browser_fallback_ui` (feature 9)

When `WebMidiPedalConnection.isSupported()` returns `false` (Safari on macOS, every
browser on iPhone/iPad, and any other browser without `navigator.requestMIDIAccess`),
the app must (1) explain the cause on every pedal-connection surface instead of
failing silently or showing a generic "not connected" reminder, and (2) leave
non-pedal behavior (song list, song detail, F4 dialog, navigation, settings)
working as on a supported browser. Live pedal I/O is the only thing gated.

A single shared component, `UnsupportedBrowserMessage`, is the only place the
explanation is rendered. It has two variants: `full` (page-level surfaces) and
`compact` (inline surfaces where a connect button used to be). No new service is
introduced: surfaces read `isSupported()` through what they already inject
(`WebMidiPedalConnection` or `PedalConnectFlow.supported`).

Revision 2 (2026-10-14) — the first draft was rejected in human review. See
`design.md` § "Revision notes" for what changed and why. Revision 3 (2026-10-14)
adds R26-R28: test presets ("Cargar presets de prueba") stay browsable on
unsupported browsers. Revision 4 (2026-10-15) adds R29-R30: when the page is
served from an insecure context (plain `http://` on a non-localhost host), the
message says to open it over `https://` instead of only recommending browsers
the user may already be using.

Out of scope: the `WebMidiPedalConnection` API shape, the SysEx codec, F4 dialog
flows, the song card, the chain board, the picker overlay, dark mode, the language
switcher, auth, the backend REST contract, and the `MockPresetsStore` data shape
(only how `/pedal/presets` renders mock presets changes — R26-R28).

Glossary:
- **Unsupported browser**: a browser where `navigator.requestMIDIAccess` is not
  exposed. `WebMidiPedalConnection.isSupported()` returns `false` exactly in this
  case (`src/app/midi/web-midi-pedal-connection.ts:75-77`).
- **Pedal-connection surface**: a UI element whose job is to connect to, read
  from, or write to the GP-5. Today these are: the `/pedal` page, the
  `/pedal/presets` page, the header `pedal-connect-button`, the inline connect
  button inside `write-to-pedal-dialog` (`write-to-pedal-connect`), and the
  "Conectar al GP-5" CTA in the `/songs` empty state (`songs-empty-connect`).
- **Non-pedal surface**: everything else (`/songs` list and its cards, `/songs/:id`,
  `/login`, `/register`, dark-mode toggle, language switcher, the F4 "Save song"
  dialog).
- **Insecure context**: the page's `globalThis.isSecureContext` is `false`
  (served over plain `http://` from a host other than `localhost`/`127.0.0.1`).
  Chrome, Edge, Opera and Firefox only expose `navigator.requestMIDIAccess` in
  secure contexts, so `isSupported()` is also `false` there, even on a browser
  that supports Web MIDI.
- **Full variant / compact variant**: the two renderings of
  `UnsupportedBrowserMessage`, selected by its single optional `variant` input.

## Detection (existing behavior, pinned)

## R1
WHILE `navigator.requestMIDIAccess` is not present on the global `navigator`,
`WebMidiPedalConnection.isSupported()` SHALL return `false`.

## R2
IF `WebMidiPedalConnection.connect()` is called while `isSupported()` returns
`false` THEN the system SHALL reject the returned promise with an `Error` whose
message is `unsupported`.

## R3
IF `navigator.requestMIDIAccess` exists but its promise rejects THEN
`WebMidiPedalConnection.connect()` SHALL reject with an `Error` whose message is
`midi_access_denied`.

## R4
WHILE `PedalConnectFlow.supported` is `false`, `PedalConnectFlow.start()` SHALL
resolve without calling `WebMidiPedalConnection.connect()`,
`Router.navigateByUrl()`, or `PedalPresetsStore.read()`.

## Shared component

## R5
The system SHALL provide a standalone component
`UnsupportedBrowserMessage` (`selector: 'app-unsupported-browser-message'`, in
`src/app/shared/unsupported-browser-message/`) whose root element carries
`data-testid="unsupported-browser-message"` and `role="status"` in both variants.

## R6
WHEN `UnsupportedBrowserMessage` is rendered without a `variant` binding and
`globalThis.isSecureContext` is not `false`, the
component SHALL render the full variant: an `<h2>` with
`unsupportedBrowser.title`, followed by `unsupportedBrowser.body`,
`unsupportedBrowser.browsers`, and `unsupportedBrowser.footnote`.

## R7
WHILE rendering the full variant, the component's root element SHALL have an
`aria-labelledby` value equal to the `id` of its own `<h2>`.

## R8
WHERE `variant` is bound to `'compact'` and `globalThis.isSecureContext` is not
`false`, the component SHALL render
`unsupportedBrowser.title` and `unsupportedBrowser.browsers` inside a single
`<p>` root, with no `<h2>`, no `<svg>`, and neither `unsupportedBrowser.body` nor
`unsupportedBrowser.footnote`.

## R9
The component SHALL contain no `<button>`, `<a>`, `<input>`, or element with a
`tabindex` attribute in either variant.

## R10
No non-spec `.html` or `.ts` file under `src/app/` other than
`src/app/shared/unsupported-browser-message/unsupported-browser-message.html` SHALL
contain the string `unsupportedBrowser.`.

## Per-surface gating

## R11
WHILE `isSupported()` returns `false`, the `/pedal` page SHALL render the existing
`<h1>` followed by `<app-unsupported-browser-message>` in the full variant, in place
of the current `<p>{{ t('pedal.unsupported') }}</p>`.

## R12
WHILE `isSupported()` returns `false`, the `/pedal` page SHALL render none of
`connect-button`, `connection-state`, `presets-link`, or `connection-error`.

## R13
IF `isSupported()` returns `true` and `connect()` rejects with
`midi_access_denied` THEN the `/pedal` page SHALL render `connection-error` with the
`pedal.midi_access_denied` text and no `unsupported-browser-message` element.

## R14
WHILE `isSupported()` returns `false` and `MockPresetsStore.presets()` is empty,
the `/pedal/presets` page SHALL render
`<app-unsupported-browser-message>` in the full variant in place of the current
`<p data-testid="unsupported-message">`, leaving no `unsupported-message`
element in the DOM.

## R15
WHILE `isSupported()` returns `false`, the `/pedal/presets` page SHALL NOT call
`PedalPresetsStore.read()` during component creation and `ngOnInit`.

## R16
WHILE `PedalConnectFlow.supported` is `false`, the header `pedal-connect-button`
SHALL render as `disabled` with its `title` attribute set to the translated
`pedalButton.unsupported_hint` string.

## R17
WHILE `isSupported()` returns `false` and the `write-to-pedal-dialog` is open, the
dialog SHALL render `<app-unsupported-browser-message variant="compact">` in place
of the not-connected reminder block, so that neither
`write-to-pedal-not-connected` nor `write-to-pedal-connect` is rendered.

## R18
IF `WriteToPedalDialog.onConnect()` is invoked while `isSupported()` returns
`false` THEN the dialog SHALL return without calling
`WebMidiPedalConnection.connect()`.

## R19
WHILE `PedalConnectFlow.supported` is `false` and the `/songs` library is empty,
the `songs-empty` block SHALL render `<app-unsupported-browser-message
variant="compact">` in place of the `songs-empty-connect` button, leaving no
`songs-empty-connect` element in the DOM.

## R20
WHILE `PedalConnectFlow.supported` is `false` and `GET /songs` returns one or more
songs, the `/songs` page SHALL render one `song-card` per song and no
`unsupported-browser-message` element.

## R21
WHILE `PedalConnectFlow.supported` is `false`, the `/songs` page SHALL NOT call
`WebMidiPedalConnection.connect()`, `WebMidiPedalConnection.readPresets()`,
`PedalPresetsStore.read()`, or `PedalConnectFlow.start()` while loading into any of
its `loaded`, `empty`, or `error` states.

## R22
WHILE `isSupported()` returns `true`, every pedal-connection surface SHALL render
its existing connect control (`connect-button`, `pedal-connect` enabled,
`write-to-pedal-connect`, `songs-empty-connect`) and no
`unsupported-browser-message` element.

## Translations

## R23
The `unsupportedBrowser` namespace SHALL have identical leaf key paths in
`public/i18n/es.json` and `public/i18n/en.json`, each leaf being a non-empty
string in both files.

## R24
Every literal translation key under `unsupportedBrowser`, `pedal`, or `pedalButton`
referenced by the F9-touched templates (the new component, `pedal-connection-page.html`,
`preset-browser-page.html`, `write-to-pedal-dialog.html`, `songs-page.html`,
`pedal-connect-button.html`, `app.html`) SHALL resolve to a string in both `es` and
`en`.

## R25
The keys `pedal.unsupported` and `pedalButton.unsupported_hint` SHALL remain present
with non-empty string values in both `public/i18n/es.json` and
`public/i18n/en.json`.

## Test presets on unsupported browsers

## R26
WHILE `isSupported()` returns `false` and `MockPresetsStore.presets()` is not
empty, the `/pedal/presets` page SHALL render `<app-unsupported-browser-message
variant="compact">` followed by the normal preset layout (`preset-layout`,
`chip-row`, `browse-presets`, `main-area`) populated with the mock presets, and
SHALL NOT render the full variant.

## R27
WHEN `MockPresetsStore.load()` is called while `isSupported()` returns `false` and
the `/pedal/presets` page is already rendered, the page SHALL switch from the full
variant to the R26 rendering without a reload.

## R28
WHILE `isSupported()` returns `false`, the `/pedal/presets` page SHALL NOT render
`not-connected-message`, and `PresetBrowserPage.retryRead()` SHALL return without
calling `PedalPresetsStore.read()`.

## Insecure context (http://)

## R29
WHILE `globalThis.isSecureContext` is `false`, the full variant of
`UnsupportedBrowserMessage` SHALL render `unsupportedBrowser.insecure_body` in
place of `unsupportedBrowser.body`, keeping the `<h2>` with
`unsupportedBrowser.title`, `unsupportedBrowser.browsers` and
`unsupportedBrowser.footnote`, and SHALL NOT render `unsupportedBrowser.body`.

## R30
WHILE `globalThis.isSecureContext` is `false`, the compact variant of
`UnsupportedBrowserMessage` SHALL render `unsupportedBrowser.title` and
`unsupportedBrowser.insecure_compact` inside its single `<p>` root, and SHALL NOT
render `unsupportedBrowser.browsers`.
