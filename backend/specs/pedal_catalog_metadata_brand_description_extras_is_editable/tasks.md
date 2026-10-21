# Tasks — pedal_catalog_metadata_brand_description_extras_is_editable

Write each failing test before the code that satisfies it. Run only the named test file while working
(`bun test <file>`); run the full `bun test` / `./init.sh` once at the end.

- [x] T1 (R1, R2) In `src/db/migrate.test.ts`: add `0010_pedal_catalog_metadata.sql` to the
      applied-files list of the "running migrate twice" test; add `pedal_catalog brand/description/
      extras/is_editable columns (pedal_catalog_metadata R1)` covering cases a–f
      (`information_schema.columns` for a–d, raw inserts for the CHECK in c, e and f); add
      `0010 backfills brand 'Valeton' on legacy rows and re-runs (pedal_catalog_metadata R2)` covering
      a–c with the `0005` pattern described in design.md "Test evidence grouping". Then write
      `src/db/migrations/0010_pedal_catalog_metadata.sql` exactly as in design.md and run
      `bun run migrate`.
- [x] T2 (R1-f, P1, P2) Add `brand` (`'Test Brand'`) to every raw `INSERT INTO pedal_catalog` fixture
      listed in design.md (`src/index.test.ts`, `src/song-pedal-configs/song-pedal-config-service.test.ts`,
      `src/pedals/pedal-service.test.ts`, `src/db/migrate.test.ts`), changing nothing else in those
      tests. Run the three files; any failure other than the new R-tests is a regression.
- [x] T3 (R3, R4) In `src/pedals/pedal-service.test.ts`, add `createPedal brand validation
      (pedal_catalog_metadata R3)` (`test.each` over a–g; 400 rows assert `PedalError` status/message,
      unchanged `pedal_catalog` count and an empty storage dir; d via `brand: null`) and
      `createPedal description (pedal_catalog_metadata R4)` (`test.each` over a–f; f via
      `description: null`). Update `seedPedal` and every existing `createPedal` call that expects
      success to pass a brand (nothing else changes in those tests). Then add `brand`/`description`
      to `CreatePedalInput`, `charLength`, the two limit constants and the validation in `createPedal`
      in `src/pedals/pedal-service.ts`, and map both parts in `src/pedals/parse-multipart.ts` with
      `toSingleStringOrRawField`.
- [x] T4 (R5, R6, R7) In `src/pedals/pedal-service.test.ts`, add `new pedals are editable with empty
      extras (pedal_catalog_metadata R5)` (case a via `createPedal`; case b is covered in T5 end to
      end), `pedal DTO exposes brand/description/extras/isEditable/canEdit (pedal_catalog_metadata R6)`
      (cases a, b, c — c inserts a raw row with brand `'Valeton'` only — and d), and `canEdit
      (pedal_catalog_metadata R7)` (`test.each` over a–g, states built with raw SQL on `songs`,
      `song_pedal_configs` and `pedal_catalog.is_editable`, read through `listPedals()`). Then extend
      `PedalDto`, `toPedalDto`, the `createPedal` `INSERT ... RETURNING` and the `listPedals` `SELECT`
      per design.md, computing `can_edit` only with `is_editable AND NOT pedal_is_attached(id)`.
- [x] T5 (R3-a, R5-b, R6) In `src/index.test.ts`, add `POST /pedals stores brand and description and
      GET /pedals returns the new fields (pedal_catalog_metadata R6)`: multipart with `brand`,
      `description`, plus `is_editable=false`, `isEditable=false`, `extras={"a":1}` -> 201 with
      `isEditable: true`, `extras: {}`, `canEdit: true`, no snake_case keys; the same pedal in
      `GET /pedals`; and a request without `brand` -> 400 `{ error: "brand is required" }`. Update the
      existing `POST /pedals` tests in this file to send a `brand` part so they keep returning 201.
- [x] T6 (P1, P2) Run `bun test src/pedals src/song-pedal-configs src/index.test.ts
      src/db/migrate.test.ts`, then `./init.sh`. Confirm the existing name/image/parameters,
      list-ordering and attach tests pass with only the `brand` fixture change from T2/T5, and record
      the R/P -> test mapping in `progress/pedal_catalog_metadata_brand_description_extras_is_editable/impl.md`.
