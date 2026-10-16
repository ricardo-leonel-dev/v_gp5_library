# Tasks — `unsupported_browser_fallback_ui` (feature 9)

Ordered steps. Each task lists the `R<n>` ids it covers. "Confirm" tasks add no
test: the implementer runs the named existing test, checks it exercises the
requirement, and records the mapping in `progress/impl_9.md`. Line numbers are as
of commit `7d29e9e`.

- [x] T1 (R1, R2, R3) Confirm existing tests, no new test:
      `src/app/midi/web-midi-pedal-connection.spec.ts:279` (R1),
      `:301` (R2), `:329` (R3).

- [x] T2 (R4) Confirm existing test, no new test:
      `src/app/pedals/pedal-connect-flow.service.spec.ts:139`
      ("R49 — when not supported, start() is a no-op").

- [x] T3 (R23, R25, R29, R30) Add the `unsupportedBrowser` namespace
      (`title`, `body`, `browsers`, `footnote`, `insecure_body`,
      `insecure_compact`; exact strings in `design.md`
      § "UI copy") to `public/i18n/es.json` and `public/i18n/en.json`. Do NOT
      remove or edit `pedal.unsupported` or `pedalButton.unsupported_hint`.

- [x] T4 (R5, R6, R7, R8, R9, R29, R30) Create
      `src/app/shared/unsupported-browser-message/unsupported-browser-message.{ts,html}`
      exactly as in `design.md` § "`UnsupportedBrowserMessage`": standalone,
      `OnPush`, `imports: [TranslocoDirective]`, one optional signal input
      `variant: 'full' | 'compact'` defaulting to `'full'`, per-instance
      `titleId`, `readonly insecure = globalThis.isSecureContext === false`
      (strict comparison, so jsdom, where the property is absent, counts as
      secure), class strings from § "Visual direction". When `insecure`:
      full variant renders `insecure_body` instead of `body` (R29); compact
      renders `insecure_compact` instead of `browsers` (R30).

- [x] T5 (R5, R6, R7, R8, R9, R29, R30) Add
      `src/app/shared/unsupported-browser-message/unsupported-browser-message.spec.ts`
      (Transloco stub loader with the 6 `unsupportedBrowser.*` es strings, as in
      `pedal-connect-button.spec.ts`). Tests, mounting through a small host
      component so `variant` can be bound:
      (a) default: root has `data-testid="unsupported-browser-message"`,
      `role="status"`; contains an `<h2>` with the title text and the body,
      browsers and footnote texts (R5, R6);
      (b) default: root `aria-labelledby` equals the `<h2>`'s `id`, and two
      instances rendered together have different ids (R7);
      (c) `variant="compact"`: root is a `<p>` with the testid and
      `role="status"`, contains title + browsers text, no `h2`, no `svg`, no
      body/footnote text (R5, R8);
      (d) both variants: `querySelectorAll('button, a, input, [tabindex]')`
      is empty (R9);
      (e) `vi.stubGlobal('isSecureContext', false)` before `createComponent`
      (`vi.unstubAllGlobals()` in `afterEach`), default variant: `<h2>` title,
      `insecure_body`, browsers and footnote texts present, `body` text absent
      (R29);
      (f) same stub, `variant="compact"`: title + `insecure_compact` text
      present, `browsers` text absent (R30);
      (g) `vi.stubGlobal('isSecureContext', true)`, both variants: no
      `insecure_body` / `insecure_compact` text (R6, R8).

- [x] T6 (R11, R12, R13, R22) `/pedal` page.
      `pedal-connection-page.ts`: add `UnsupportedBrowserMessage` to `imports`.
      `pedal-connection-page.html`: replace line 5
      (`<p …>{{ t('pedal.unsupported') }}</p>`) with
      `<app-unsupported-browser-message />`; keep the `<h1>` and the existing
      `@else` block as is.
      `pedal-connection-page.spec.ts`: add the `unsupportedBrowser.*` keys to
      `esTranslations`; retarget the existing test at line 96 to assert the
      `<h1>` text, `[data-testid="unsupported-browser-message"]` present, and
      `connect-button`, `connection-state`, `presets-link`, `connection-error`
      all absent (R11, R12); add a test with `fake.connectError =
      'midi_access_denied'` that clicks connect and asserts `connection-error`
      shows the `pedal.midi_access_denied` text and no
      `unsupported-browser-message` exists (R13); extend the existing
      "renders the connect control … when Web MIDI is supported" test (line 111)
      with `unsupported-browser-message` absent (R22).

- [x] T7 (R14, R15) `/pedal/presets` page.
      `preset-browser-page.ts`: add `UnsupportedBrowserMessage` to `imports`
      (no other `.ts` change; `ngOnInit` already returns early at line 184).
      `preset-browser-page.html`: replace lines 3-5
      (`<p … data-testid="unsupported-message">…</p>`) with
      `<app-unsupported-browser-message />`.
      `preset-browser-page.spec.ts`: add the `unsupportedBrowser.*` keys to
      `esTranslations`; new test with `fake.isSupportedResult = false` asserting
      `unsupported-browser-message` present and `unsupported-message` absent
      (R14); new test that does `const read = vi.spyOn(TestBed.inject(PedalPresetsStore), 'read')`
      before `createComponent`, sets `fake.isSupportedResult = false` and
      `fake.setConnectionState('connected')`, runs `detectChanges()` +
      `whenStable()`, and asserts `read` was not called (R15).

- [x] T8 (R16, R22) Confirm existing tests, no change:
      `src/app/pedals/pedal-connect-button/pedal-connect-button.spec.ts:93`
      ("not supported: disabled with title = unsupported_hint", R16) and `:86`
      ("clicking the button calls flow.start()", supported → enabled, R22).

- [x] T9 (R17, R18, R22) `write-to-pedal-dialog`.
      `write-to-pedal-dialog.ts`: add `UnsupportedBrowserMessage` to `imports`;
      add `readonly supported = this.pedal.isSupported();` next to
      `connectionState` (line 65); first line of `onConnect()`:
      `if (!this.supported) return;`.
      `write-to-pedal-dialog.html`: change the block at line 184 to
      `@if (!supported) { <div class="<existing reminder container classes>"><app-unsupported-browser-message variant="compact" /></div> } @else if (connectionState() !== 'connected') { …existing block unchanged… }`.
      `write-to-pedal-dialog.spec.ts` fixture update (required, see `design.md`
      § "Test fixtures"): add `isSupported: () => true` to every inline
      `stubPedal` (≈ lines 196, 228, 258, 326) and to `mountStubbed`'s
      `useValue` (≈ line 418); in the first `describe`'s `beforeEach` add
      `vi.spyOn(WebMidiPedalConnection.prototype, 'isSupported').mockReturnValue(true)`
      and restore it in `afterEach`; add the `unsupportedBrowser.*` keys to the
      stub loader's translations. New tests with a stub whose
      `isSupported: () => false`: compact message present,
      `write-to-pedal-not-connected` and `write-to-pedal-connect` absent (R17);
      calling the dialog instance's `onConnect()` (via
      `fixture.debugElement.query(By.directive(WriteToPedalDialog)).componentInstance`)
      does not call `connect` (R18). Extend the existing test at line 192 with
      `unsupported-browser-message` absent (R22).

- [x] T10 (R19, R20, R21, R22) `/songs` page.
      `songs-page.ts`: add `UnsupportedBrowserMessage` to `imports`; add
      `readonly supported = this.connectFlow.supported;`.
      `songs-page.html`: inside `@case ('empty')`, wrap the
      `songs-empty-connect` button as
      `@if (supported) { …button… } @else { <div class="mx-auto mt-5 max-w-sm"><app-unsupported-browser-message variant="compact" /></div> }`.
      `songs-page.spec.ts`: give `setupF26` a `supported?: boolean` option;
      set `connectFlow.supported = opts.supported ?? true` and make
      `pedal.isSupported` return the same value (without this, the existing CTA
      test at line 736 breaks); add the `unsupportedBrowser.*` keys to the stub
      loader's translations (also used by the F5 `describe`, which runs with the
      real, jsdom-unsupported pedal). New tests with `setupF26({ supported: false })`:
      (a) `GET /songs` → `[]`: compact message inside `songs-empty`, no
      `songs-empty-connect` (R19);
      (b) `GET /songs` → 2 songs: 2 `song-card`, no `unsupported-browser-message` (R20);
      (c) run (a), (b) and a 500 response; after each, assert `pedal.connect`,
      `pedal.readPresets`, `pedalPresets.read` and `connectFlow.start` were not
      called (R21).
      Extend the existing test at line 736 with `unsupported-browser-message`
      absent (R22).

- [x] T11 (R10, R23, R24, R25) Add a new `describe('i18n parity — F9 unsupportedBrowser')`
      to `src/app/songs/i18n-parity.spec.ts` (not `src/app/pedals/i18n-parity.spec.ts`,
      which has no source scanner), reusing the file's helpers:
      (a) identical `unsupportedBrowser` leaf paths in en/es, every leaf
      non-empty (R23);
      (b) scan these sources for literal keys matching
      `'((?:unsupportedBrowser|pedalButton|pedal)\.[A-Za-z_.]+)'` and assert each
      resolves to a string in en and es:
      `src/app/shared/unsupported-browser-message/unsupported-browser-message.html`,
      `src/app/pedals/pedal-connection-page/pedal-connection-page.html`,
      `src/app/pedals/preset-browser-page/preset-browser-page.html`,
      `src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.html`,
      `src/app/songs/songs-page/songs-page.html`,
      `src/app/pedals/pedal-connect-button/pedal-connect-button.html`,
      `src/app/app.html`; also assert the extracted set contains
      `unsupportedBrowser.title` (guards against an empty scan) (R24);
      (c) `pedal.unsupported` and `pedalButton.unsupported_hint` are non-empty
      strings in en and es (R25);
      (d) walk `src/app/` recursively (`readdirSync`), and for every `.html`/`.ts`
      file not ending in `.spec.ts` assert it does not contain
      `unsupportedBrowser.` unless it is the component's `.html` (R10).

- [x] T12 (R10) Update the "What NOT to do" bullet in `docs/architecture.md`
      about Web MIDI to say: render `UnsupportedBrowserMessage`
      (`src/app/shared/unsupported-browser-message/`, `variant="compact"` for
      inline spots) instead of writing a new message.

- [x] T13 (R26, R27, R28) Test presets on `/pedal/presets` (after T7).
      `preset-browser-page.ts`: add
      `readonly hasMockPresets = computed(() => this.mockPresets.presets().length > 0);`;
      first line of `retryRead()`: `if (!this.supported) return;`.
      `preset-browser-page.html`: change the T7 gate to
      `@if (!supported && !hasMockPresets()) { <app-unsupported-browser-message /> } @else { @if (!supported) { <div class="mt-4 px-4"><app-unsupported-browser-message variant="compact" /></div> } …existing content… }`,
      and guard the existing not-connected line as
      `@if (supported && connectionState() !== 'connected' && presets().length === 0)`.
      `preset-browser-page.spec.ts` (with `fake.isSupportedResult = false`):
      (a) `TestBed.inject(MockPresetsStore).load()` before `createComponent`:
      compact message present, full variant (`h2`) absent, `preset-layout`,
      `chip-row`, `browse-presets`, `main-area` present, opening the picker lists
      the mock presets (R26);
      (b) create the page with an empty mock store (full variant present), then
      call `load()`, `detectChanges()`: compact message + `preset-layout` present,
      no `h2` (R27);
      (c) `not-connected-message` absent in (a) and with an empty store; calling
      `componentInstance.retryRead()` does not call the spied
      `PedalPresetsStore.read` (R28).

- [x] T14 (R1-R30) Run `./init.sh` and `bun run test`; all new and existing tests
      pass. Manual Level 2 check in Safari (`docs/verification.md`): `/pedal`,
      `/pedal/presets` (with and without "Cargar presets de prueba"), header button, write dialog, `/songs` empty and non-empty,
      at 375px and 1280px. Insecure context (R29, R30): `npm start`, then
      open `http://<LAN-IP>:4200` in Chrome on another device; `/pedal` shows
      the HTTPS body and the write dialog shows the HTTPS compact hint. Record the R→test map from `design.md` in
      `progress/impl_9.md`.
      Done 2026-10-16: `./init.sh` green (42 files, 1332 tests); Safari manual
      check passed (human). The LAN-IP check could not be run: backend dev CORS
      only allows `http://localhost:4200` and `apiBaseUrl` is
      `http://localhost:3000`, so another device can't log in (environment
      limit, out of scope). R29/R30 are covered by
      `unsupported-browser-message.spec.ts`.
