# Requirements — stage_aware_provider_config

Scope note: no deployment-stage concept exists anywhere in this codebase today (confirmed by grep across
`src/`, `docs/`, `.env*` for `NODE_ENV`/`APP_STAGE`/`APP_ENV`/"stage" — none found). This feature
introduces the concept from nothing: an active-stage selector (`APP_STAGE`), a git-tracked per-stage
config file, and a resolution module that both `src/db/client.ts`'s `getDb()` and `src/storage/index.ts`'s
`getStorage()` consult instead of reading `process.env.DATABASE_URL` / `process.env.STORAGE_DIR` directly.

Scope note on storage: per the feature's own acceptance criteria, `LocalFsStorageAdapter` is the only
storage implementation as of this feature for every stage (`dev`, `staging`, `main`). No
`SupabaseStorageAdapter` or any other non-local storage adapter class is added here — this is verified by
absence (no such file/class exists in `src/storage/` after this feature), not by a positive `SHALL NOT`
requirement, per `docs/specs.md`'s guidance to keep every `R<n>` a concrete pass/fail test. What R9/R11
below *do* require is that storage resolution runs through the same per-stage, config-driven mechanism as
DB resolution (a `provider` discriminator switched on in one resolution function), not a separate ad-hoc
branch — that is what lets a later feature add a second storage provider without redesigning anything.

Scope note on the `SUPABASE_URL`/`SUPABASE_ANON_KEY` pair already present in `.harness.json`: those
belong exclusively to this harness's own best-effort dev-tooling DB mirror (`scripts/sync_postgres.sh`,
invoked from `init.sh` step 6), unrelated to the application's runtime DB/storage. This feature's
`APP_STAGE`/`config/stages.json`/`DATABASE_URL`/`STORAGE_DIR` mechanism is entirely independent of them
and must not read or write either variable.

Scope note on the DB "provider" concept: every Postgres option named in the feature description (a local
instance, another Postgres instance via Docker, or hosted Supabase Postgres) is wire-compatible Postgres
reachable through a single connection string — `Bun.sql`/`bun run migrate` need no special-casing for any
of them. "Provider" in this spec is therefore a per-stage *resolution strategy* (env-var-backed, with or
without a default), not a set of different client implementations; see `design.md` for why a `provider`
discriminator field is still included in the config schema for both DB and storage, symmetrically.

## R1
The system SHALL provide a git-tracked config file, `src/config/stages.json`, that maps each of the three
deployment stages (`dev`, `staging`, `main`) to a Postgres provider configuration (`db`) and a storage
provider configuration (`storage`).

## R2
The system SHALL determine the active deployment stage from the `APP_STAGE` environment variable.

## R3
WHEN `APP_STAGE` is unset or an empty string, the system SHALL use `dev` as the active stage.

## R4
IF `APP_STAGE` is set to a value other than `dev`, `staging`, or `main` THEN the system SHALL throw a
`StageConfigError` naming the invalid value, and SHALL NOT resolve any Postgres connection string or
storage adapter.

## R5
WHEN the active stage's `db.connectionEnv`-named environment variable is set to a non-empty value, the
system SHALL resolve that stage's Postgres connection string to that environment variable's value.

## R6
IF the active stage is `dev` and its `db.connectionEnv`-named environment variable is unset or empty THEN
the system SHALL resolve the Postgres connection string to `src/config/stages.json`'s `dev.db.defaultUrl`.

## R7
IF the active stage is `staging` or `main` and its `db.connectionEnv`-named environment variable is unset
or empty THEN the system SHALL throw a `StageConfigError` naming the stage and the missing environment
variable, and SHALL NOT fall back to any default connection string.

## R8
The system SHALL use the Postgres connection string resolved by R5, R6, or R7 (as applicable to the active
stage) to construct the `SQL` client returned by `src/db/client.ts`'s `getDb()`, instead of reading
`process.env.DATABASE_URL` directly.

## R9
The system SHALL resolve the storage adapter for the active stage through the same per-stage,
config-driven resolution mechanism (`src/config/stages.json` plus one resolution function keyed on that
stage's `storage.provider` field) used by R5-R8 for the Postgres connection, rather than a separate,
independent code path.

## R10
WHEN the active stage's `storage.provider` field is `local-fs`, the system SHALL construct a
`LocalFsStorageAdapter` whose root directory is the active stage's `storage.dirEnv`-named environment
variable's value if set to a non-empty string, or `src/config/stages.json`'s
`<stage>.storage.defaultDir` otherwise.

## R11
IF the active stage's `storage.provider` field in `src/config/stages.json` is a value other than
`local-fs` THEN the system SHALL throw a `StageConfigError` naming the stage and the unrecognized provider
value, and SHALL NOT construct any storage adapter.

## R12
The system SHALL use the storage adapter resolved by R9-R11 as the value returned by
`src/storage/index.ts`'s `getStorage()`.

## R13
The system SHALL preserve `getDb(): SQL` and `getStorage(): StorageAdapter` as zero-argument functions
returning the same types they returned before this feature, so no existing caller in `src/auth/`,
`src/songs/`, `src/pedals/`, or `src/song-pedal-configs/` requires a code change.

## R14
The system SHALL document, in `docs/architecture.md`, `src/config/stages.json`'s schema (the `db`/
`storage` shape per stage, including `provider`, `connectionEnv`/`dirEnv`, and `defaultUrl`/`defaultDir`),
the `APP_STAGE` active-stage selection mechanism (R2-R4), and the default-vs-required resolution rules for
each stage (R5-R7, R10).

## R15
The system SHALL document, in `docs/architecture.md`, the exact steps and environment variable to set
(`DATABASE_URL`, per `src/config/stages.json`'s `staging.db.connectionEnv`/`main.db.connectionEnv`) to
point the `staging` or `main` stage's Postgres connection at a hosted Supabase Postgres instance,
including obtaining the connection string from the Supabase project dashboard and running `bun run
migrate` once against it.

## R16
The system SHALL document, in `docs/architecture.md`, an explicit decision to keep the existing
JWT-based auth approach for now, together with its rationale, given that hosted Supabase Postgres is
one supported `staging`/`main` Postgres option under this feature's resolution mechanism (using
Supabase Postgres for a stage does not require using Supabase Auth for that same stage — they are
independently selectable). The documentation SHALL state explicitly that this is a "for now" decision,
not a permanent rejection: migrating to Supabase Auth remains an option to opt into later as its own
future feature, once desired, rather than something this feature forecloses.
