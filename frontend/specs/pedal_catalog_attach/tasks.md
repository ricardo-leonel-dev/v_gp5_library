# Tasks — F36 `pedal_catalog_attach`

Execute in order; write each test before the code that satisfies it. Test grouping follows design.md §9.
Targeted run: `bunx ng test --watch=false --include <file>`.

## Types and API (`src/app/pedal-catalog/`)

^- [x] T1 (R6, R9, R11) Add `pedal-catalog.ts` types (design §2). In `pedal-catalog-api.service.spec.ts`, assert
  with `HttpTestingController`: `listPedals` → `GET /pedals`; `listSongPedals('s/1')` →
  `GET /songs/s%2F1/pedals`; `attachPedal('s1','p1','Lead')` → `POST /songs/s1/pedals` whose body deep-equals
  `{ pedal_catalog_id: 'p1', label: 'Lead', config: {} }`; `detachPedal('s1','c1')` →
  `DELETE /songs/s1/pedals/c1` resolving on 204; and (R11 b) the service prototype's own method names are exactly
  the four listed. Then implement `pedal-catalog-api.service.ts`.

## Pure logic

^- [x] T2 (R5) `attach-draft.spec.ts`: `it.each` over R5 cases a-f (include a 256-code-point label and a label of
  255 `😀`), asserting the result object. Then implement `attach-draft.ts`.
^- [x] T3 (R2, R4, R7, R10) `song-pedal-errors.spec.ts`: `it.each` tables for `classifyPedalLoadError` (0, 401, 404,
  500, non-HTTP), `mapAttachError` (R7 a-f, including another 400 message and a 400 with no body) and
  `mapDetachError` (R10 a-d). Then implement `song-pedal-errors.ts`.

## i18n

^- [x] T4 (R13) `src/app/pedal-catalog/i18n-parity.spec.ts` (copy the helpers from
  `src/app/songs/i18n-parity.spec.ts`): leaf paths under `songPedals` equal in `es`/`en`, every leaf non-empty, and
  every key of design.md "UI copy" present. Then add the `songPedals` namespace to `public/i18n/en.json` and
  `public/i18n/es.json`.

## Section component (`src/app/pedal-catalog/song-pedals-section/`)

All tests in `song-pedals-section.spec.ts` (TestBed, `provideHttpClientTesting`, `songId` set via
`fixture.componentRef.setInput`). One `describe` per rule.

^- [x] T5 (R1, R2, R3 a) Tests: on create, exactly one `GET /songs/<id>/pedals` and one `GET /pedals`; R1 a-d (rows
  in order; name from catalog; `pedal_unavailable` when missing from a loaded catalog; no name while the catalog
  is pending or failed); R2 a-g (loading with `aria-busy`, empty, unreachable/404/500 with retry, 401 with
  `/login` link and no retry, retry re-requests). Then create the component skeleton, list loading, name lookup
  and list states.
^- [x] T6 (R3, R4) Tests: R3 b-e (open panel, 3 options in order including a `createdBy: null` one, single
  selection, Cancel resets with no request, `aria-expanded`); R4 a-f (loading, empty with label input disabled,
  unreachable, 401, other failure, retry). Attach is disabled in every R4 case. Then implement the panel and
  catalog states.
^- [x] T7 (R5) Tests: R5 g-i through the DOM (blur after blank → field error and `aria-invalid="true"`; 256
  code points → `label_too_long` without blur; no pedal → hint shown and Attach disabled; counter shows code
  points). Then wire `draft`, `labelError`, `labelTouched` and the field markup.
^- [x] T8 (R6) Tests: R6 a-e (exact body with trimmed label and `config: {}`; busy label and a second click sends
  nothing; 201 prepends the row, closes the panel, resets the draft and sets the status text; empty state replaced;
  `expectNone` for a list re-fetch). Then implement `attach()`.
^- [x] T9 (R7) Tests: `it.each` over R7 a-f flushing each error on the POST: message location and text, draft kept,
  Attach re-enabled; case b also clears the selection and expects one new `GET /pedals`; R7 g editing clears the
  alert. Then implement the attach error handling.
^- [x] T10 (R8) Tests: R8 a-d (confirmation text with label, focus on Keep, no request; Keep and Escape close it and
  return focus to Detach; second row replaces the first). Then implement `askDetach`/`cancelDetach` and the
  confirmation markup.
^- [x] T11 (R9) Tests: R9 a-e (one DELETE to `/songs/<id>/pedals/<entry id>`; Confirm/Keep disabled and busy label
  while pending; 204 removes only that row and sets the status text; last row → empty state; `expectNone` for any
  re-fetch). Then implement `confirmDetach`.
^- [x] T12 (R10) Tests: `it.each` over R10 a-d flushing each error on the DELETE (404 removes the row, others keep
  it; message text; confirmation closed); R10 e a later success clears the alert. Then implement the detach error
  handling.
^- [x] T13 (R11) Test: full flow load → attach (201) → detach (204), then `httpMock.verify()`; additionally
  `httpMock.match(r => r.url.includes('/pedals') && r.method !== 'GET' && !(r.method === 'POST' &&
  r.url.endsWith('/songs/s1/pedals')) && !(r.method === 'DELETE' && /\/songs\/s1\/pedals\/[^/]+$/.test(r.url)))`
  is empty at every step.
^- [x] T14 (R1-R10) Apply design.md "Visual direction" classes, test ids, `role`/`aria-*` attributes and the
  footswitch mark to `song-pedals-section.html`; add one layout-contract test (row has `min-w-0`, label has
  `truncate`, Detach has `shrink-0`, status region has `role="status"`).

## Song detail page (`src/app/songs/song-detail-page/`)

^- [x] T15 (P1) In `song-detail-page.spec.ts`, add `flushSongPedals(httpMock, id)` (flushes `GET /pedals` and
  `GET /songs/<id>/pedals` with `[]`) and call it in every test that reaches `loaded` and calls `verify()`.
  Confirm the suite is otherwise unchanged and green after T16.
^- [x] T16 (R12, R2 h) Tests in `song-detail-page.spec.ts`: R12 a-c (one section in `loaded`, after
  `song-detail-extras-grid`, using the page's song id; none and no pedal requests in `loading`, `not_found`,
  `error`, `session_expired`); R2 h (pedals list 500 and catalog 0 → presets, files and extra sections still
  rendered and page state still `loaded`). Then import `SongPedalsSection` and mount it per design §6.

## Verification

^- [x] T17 (all) `bun run test` green; `./init.sh` passes. Record the traceability map (every R1-R13 case row and
  P1 → test name) in `progress/impl_pedal_catalog_attach.md`.
- [ ] T18 (R12, Visual direction) Manual check with the backend running: attach and detach a pedal on a real song
  at 375px and ≥1024px in light and dark mode; no horizontal overflow; confirm via the backend that the catalog
  pedal still exists after detach. Note the result in `progress/impl_pedal_catalog_attach.md`.
