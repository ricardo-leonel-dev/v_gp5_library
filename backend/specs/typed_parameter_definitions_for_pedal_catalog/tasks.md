# Tasks — typed_parameter_definitions_for_pedal_catalog

Write each failing test before the code that satisfies it. Run only the named test file while working
(`bun test <file>`); run the full `bun test` / `./init.sh` once at the end.

- [x] T1 (R4) In `src/db/migrate.test.ts`, add `pedal_catalog.parameters is NOT NULL jsonb defaulting
      to '[]' (typed_parameter_definitions R4)` (cases a–b: `information_schema.columns` + insert a row
      without `parameters` and read `[]`) and `re-executing the 0008 SQL ... does not throw (R4)`
      (case c). Then add `src/db/migrations/0008_pedal_parameters.sql` per design.md and run
      `bun run migrate`.
- [x] T2 (R1, R2) Create `src/pedals/pedal-parameters.test.ts` with a `test.each` over R2 cases b,
      d–l (one row per case, asserting `ok: false` and the message prefix) and a `test.each` over the
      normalization rows R1 b, e, f, g, h (trimming, unknown fields and `step` dropped, knob `min`/`max`
      defaulted to `0`/`10`). Then implement `ParameterDefinition`,
      `ParseResult` and `parseParameterDefinitions` in `src/pedals/pedal-parameters.ts`.
- [x] T3 (R5) In `src/pedals/pedal-parameters.test.ts`, add a `test.each` over R5 cases a–h and j
      for `validateConfigAgainstParameters` (pure). Then implement it.
- [x] T4 (R2-a/c) In `src/pedals/parse-multipart.ts`, add `parameters?: string | null` to
      `CreatePedalInput` (type lives in `pedal-service.ts`) and map `body.parameters`: absent →
      `undefined`, one string → the string, array or `File` → `null`.
- [x] T5 (R1, R2, R3, P1) In `src/pedals/pedal-service.test.ts`, add `createPedal stores typed
      parameters (R1)` (`test.each` cases a, c, d, e — e asserts the returned and stored knob has `min: 0, max: 10`) and `malformed parameters -> PedalError(400), no
      row, no stored bytes (R2)` (rows a, b, c via `null`, i, j, k — the full matrix is T2's), and
      `listPedals returns [] for a legacy row (R3-c)` (insert the row with plain SQL, no
      `parameters`). Then extend `PedalDto`/`toPedalDto`, `createPedal` (validate before
      `storage.put`, insert `parameters::jsonb`, return it) and `listPedals`' `SELECT`. Confirm the
      existing name/image tests still pass unchanged (P1).
- [x] T6 (R5, R6, P2) In `src/song-pedal-configs/song-pedal-config-service.test.ts`, seed one typed
      pedal (knob/switch/selector) and one legacy pedal, then add `config vs typed pedal definitions
      (R5)` (`test.each`: a, d, f, i → row created with config as sent; b, c, e, g, h, j → 400 and row
      count unchanged), `legacy pedal keeps free-form config (R6)` (a, b), and `ownership and label
      errors win over a config mismatch (P2)` (foreign song + invalid config → 404; missing label +
      invalid config → 400 `label is required`). Then select `parameters` in the pedal lookup and call
      `validateConfigAgainstParameters` after the existing config-shape check when the list is
      non-empty.
- [x] T7 (P3) In `src/song-pedal-configs/song-pedal-config-service.test.ts`, add `stored configs are
      not re-validated on list (P3)`: insert a `song_pedal_configs` row by SQL whose `config` violates
      its typed pedal's definitions, then assert `listSongPedalConfigs` returns it unchanged.
- [x] T8 (R1, R2, R3, R5) In `src/index.test.ts`, extend `POST /pedals end-to-end via app.request`:
      append a `parameters` JSON part (R1-a), assert the 201 body's `parameters` (R3-a) and that the
      same pedal in `GET /pedals` has an identical `parameters` (R3-b); add a 400 case with the
      `parameters` part appended twice (R2-c); add `POST /songs/:id/pedals` against that pedal with
      `{ "level": 11 }` → 400, `{ "level": 5.5 }` → 400 and `{ "level": 5, "boost": true }` → 201
      (R5 over HTTP). No `src/index.ts`
      change is expected; if one is needed, record why in `progress/impl_<feature>.md`.
- [x] T9 (all) Run `./init.sh`; write the traceability table (R1–R6, P1–P3 → test names) in
      `progress/impl_typed_parameter_definitions_for_pedal_catalog.md`.
