- [x] T1 (R1) Create `src/config/stages.json` with the `dev`/`staging`/`main` entries shown in
      `design.md` (`dev.db.defaultUrl` matching `.env.example`'s `DATABASE_URL`; `staging`/`main`
      omitting `defaultUrl`; all three stages' `storage` set to `provider: "local-fs"`,
      `dirEnv: "STORAGE_DIR"`, `defaultDir: "./storage"`).
- [x] T2 (R2, R3, R4) Create `src/config/stage.ts`: `Stage` type, `StageConfigError`, and
      `getActiveStage(env)` — returns `"dev"` when `APP_STAGE` is unset/empty, returns the value when it
      is `dev`/`staging`/`main`, throws `StageConfigError` naming the value otherwise.
- [x] T3 (R5, R6, R7) In `src/config/stage.ts`, add `resolveDatabaseUrl(stage, config, env)`: returns the
      `connectionEnv`-named env var's value when non-empty; else `db.defaultUrl` when defined; else throws
      `StageConfigError` naming the stage and the missing env var.
- [x] T4 (R9, R10, R11) In `src/config/stage.ts`, add `resolveStorageDir(stage, config, env)` (same
      env-var/default fallback shape as T3, for `storage.dirEnv`/`storage.defaultDir`) and
      `createStorageAdapter(stage, config, env)`, which switches on `storage.provider`: `"local-fs"` →
      `new LocalFsStorageAdapter(resolveStorageDir(...))`; any other value → throws `StageConfigError`
      naming the stage and the unrecognized provider.
- [x] T5 (R8, R13) Update `src/db/client.ts`'s `getDb()` to build its `SQL` client from
      `resolveDatabaseUrl()` instead of `process.env.DATABASE_URL` directly, keeping `getDb(): SQL` a
      zero-argument function.
- [x] T6 (R12, R13) Update `src/storage/index.ts`'s `getStorage()` to return `createStorageAdapter()`
      instead of constructing `LocalFsStorageAdapter` from `process.env.STORAGE_DIR` directly, keeping
      `getStorage(): StorageAdapter` a zero-argument function.
- [x] T7 (R2, R3) Add `src/config/stage.test.ts` tests for `getActiveStage`: unset `APP_STAGE` → `"dev"`;
      empty-string `APP_STAGE` → `"dev"`; `APP_STAGE="staging"` → `"staging"`; `APP_STAGE="main"` →
      `"main"`.
- [x] T8 (R4) Add a `getActiveStage` test: `APP_STAGE="bogus"` throws `StageConfigError` with a message
      containing `"bogus"`.
- [x] T9 (R5) Add a `resolveDatabaseUrl` test: with a fixture `StagesFile` and a fixture env object
      containing a non-empty value for the stage's `connectionEnv` key, the function returns that value
      (covers all three stages, since R5's rule is stage-independent).
- [x] T10 (R6) Add a `resolveDatabaseUrl` test: stage `"dev"`, fixture env missing `DATABASE_URL`, returns
      the fixture config's `dev.db.defaultUrl`.
- [x] T11 (R7) Add two `resolveDatabaseUrl` tests: stage `"staging"` and stage `"main"`, each with a
      fixture env missing `DATABASE_URL` and a fixture config with no `defaultUrl` for that stage, both
      throw `StageConfigError` whose message contains the stage name and `"DATABASE_URL"`.
- [x] T12 (R10) Add a `createStorageAdapter` test: stage config with `storage.provider: "local-fs"` and a
      fixture env supplying `STORAGE_DIR`, returns a `LocalFsStorageAdapter` instance whose root directory
      (verified via a `put`/`get` round-trip against a fresh `mkdtemp` dir passed as the env value) matches
      the supplied env value.
- [x] T13 (R10) Add a `createStorageAdapter` test: same as T12 but with the env var unset, verifying the
      adapter round-trips against `defaultDir` (`./storage`) rather than throwing — proves storage's
      default applies even though DB's does not for staging/main.
- [x] T14 (R11) Add a `createStorageAdapter` test: fixture config with `storage.provider: "s3"` (or any
      value other than `"local-fs"`), throws `StageConfigError` whose message contains `"s3"`.
- [x] T15 (R8, R13) Add `src/db/client.test.ts`: with `APP_STAGE` unset and `DATABASE_URL` left at its
      real `.env` value, `getDb()` returns an `SQL` instance capable of running `SELECT 1` (proves
      `resolveDatabaseUrl()` wiring didn't break the real dev connection used by every other existing DB
      test) — also asserts `getDb.length === 0` (still zero-argument, R13).
- [x] T16 (R12, R13) Add a test to `src/storage/local-fs-adapter.test.ts` or a new
      `src/storage/index.test.ts`: with `APP_STAGE` unset and `STORAGE_DIR` left at its real `.env` value,
      `getStorage()` returns a `LocalFsStorageAdapter` that round-trips a `put`/`get` against the real
      configured storage dir — also asserts `getStorage.length === 0` (R13).
- [x] T17 (R14, R15, R16) Add "Deployment Stages & Provider Configuration" to `docs/architecture.md`
      (after "Data Flow", before "What NOT to do") per `design.md`'s outline: the `stages.json` schema
      table, `APP_STAGE` selection rules, the per-stage default-vs-required resolution table, the
      Supabase-Postgres-for-staging/main steps (dashboard connection string → `DATABASE_URL` → `bun run
      migrate`), the Docker-Postgres option, the storage-provider-extensibility note, and the JWT-vs-
      Supabase-Auth decision with rationale.
- [x] T18 (R14) Add a commented `APP_STAGE` line to `.env.example` per `design.md`.
