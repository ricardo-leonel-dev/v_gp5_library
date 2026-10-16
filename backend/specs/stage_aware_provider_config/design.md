# Design — stage_aware_provider_config

## New layer: `src/config/`

Adds a fourth persistence/infra-adjacent layer alongside `src/db/`, `src/storage/`, `src/auth/` (per
`docs/architecture.md` principle 1's layer list, which this feature extends):

```
src/config/
├── stages.json       # R1 — git-tracked, per-stage db/storage config
├── stage.ts          # resolution functions consumed by src/db/client.ts and src/storage/index.ts
└── stage.test.ts      # unit tests, no real Postgres/filesystem I/O
```

### Why `src/config/stages.json`, not a repo-root `config/stages.json`

`tsconfig.json` sets `"include": ["src"]` with no `rootDir` override. A JSON file living outside `src/`
would sit outside that include set — `resolveJsonModule`'s static `import stagesConfig from
"../../config/stages.json"` would resolve fine for Bun at runtime (Bun doesn't enforce `rootDir`), but is
exactly the kind of "works today, silently stops working once someone tightens tsconfig" foot-gun this
project doesn't need. Every other config surface (`.env.example`, `package.json`) is either a real
root-level dotfile or genuinely package-wide; a config file scoped to a single module's resolution logic
belongs next to that module, the same way `src/db/migrations/*.sql` sits inside `src/db/` rather than at
the repo root. See "Discarded alternatives" for the repo-root option considered and rejected.

### `src/config/stages.json` (R1)

```json
{
  "dev": {
    "db": {
      "provider": "postgres",
      "connectionEnv": "DATABASE_URL",
      "defaultUrl": "postgres://postgres:postgres@localhost:5432/gp5_library"
    },
    "storage": {
      "provider": "local-fs",
      "dirEnv": "STORAGE_DIR",
      "defaultDir": "./storage"
    }
  },
  "staging": {
    "db": { "provider": "postgres", "connectionEnv": "DATABASE_URL" },
    "storage": { "provider": "local-fs", "dirEnv": "STORAGE_DIR", "defaultDir": "./storage" }
  },
  "main": {
    "db": { "provider": "postgres", "connectionEnv": "DATABASE_URL" },
    "storage": { "provider": "local-fs", "dirEnv": "STORAGE_DIR", "defaultDir": "./storage" }
  }
}
```

`dev.db.defaultUrl` mirrors `.env.example`'s existing `DATABASE_URL` value exactly (R6) — a fresh
checkout with no `.env` at all still resolves a usable local-Postgres connection string. `staging`/`main`
deliberately omit `defaultUrl` (R7): a missing connection string in a real deploy environment must fail
loudly at `getDb()`'s first call, never silently fall through to a value that would point staging/prod at
someone's laptop. No entry ever stores a real secret — `connectionEnv`/`dirEnv` name *which* environment
variable holds the value; the value itself is supplied by whatever sets process env at deploy time (an
`.env` file locally, the platform's secret store in staging/main), identical to how `DATABASE_URL` already
works today. This file adding a *new* stage later (e.g. a `qa` stage) requires only a new top-level JSON
key with `provider: "postgres"` — no code change — satisfying R1's "without any code change" acceptance
criterion, because every Postgres option this app supports (local, Docker, Supabase) is the same wire
protocol behind one connection string.

### `src/config/stage.ts`

```ts
import type { StorageAdapter } from "../storage/adapter";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import stagesConfig from "./stages.json";

export type Stage = "dev" | "staging" | "main";
const KNOWN_STAGES: readonly Stage[] = ["dev", "staging", "main"];

export interface DbProviderConfig {
  provider: string;
  connectionEnv: string;
  defaultUrl?: string;
}
export interface StorageProviderConfig {
  provider: string;
  dirEnv: string;
  defaultDir?: string;
}
export interface StageConfig {
  db: DbProviderConfig;
  storage: StorageProviderConfig;
}
export type StagesFile = Record<Stage, StageConfig>;

export class StageConfigError extends Error {}

export function getActiveStage(env: NodeJS.ProcessEnv = process.env): Stage {
  const raw = env.APP_STAGE;
  if (raw === undefined || raw === "") return "dev";
  if ((KNOWN_STAGES as readonly string[]).includes(raw)) return raw as Stage;
  throw new StageConfigError(
    `invalid APP_STAGE "${raw}" (expected one of ${KNOWN_STAGES.join(", ")})`,
  );
}

export function resolveDatabaseUrl(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { connectionEnv, defaultUrl } = config[stage].db;
  const fromEnv = env[connectionEnv];
  if (fromEnv) return fromEnv;
  if (defaultUrl !== undefined) return defaultUrl;
  throw new StageConfigError(
    `stage "${stage}" requires "${connectionEnv}" to be set (no default configured)`,
  );
}

export function resolveStorageDir(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const { dirEnv, defaultDir } = config[stage].storage;
  const fromEnv = env[dirEnv];
  if (fromEnv) return fromEnv;
  if (defaultDir !== undefined) return defaultDir;
  throw new StageConfigError(
    `stage "${stage}" requires "${dirEnv}" to be set (no default configured)`,
  );
}

export function createStorageAdapter(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): StorageAdapter {
  const { provider } = config[stage].storage;
  switch (provider) {
    case "local-fs":
      return new LocalFsStorageAdapter(resolveStorageDir(stage, config, env));
    default:
      throw new StageConfigError(`unrecognized storage provider "${provider}" for stage "${stage}"`);
  }
}
```

Every resolution function takes `(stage, config, env)` with defaults, mirroring the existing DI pattern
already used for testability elsewhere (`storage: StorageAdapter = getStorage()` in
`song-service.ts`/`pedal-service.ts`) — tests pass a fixture `StagesFile` and a plain `Record<string,
string>` env object instead of mutating `process.env` or `src/config/stages.json` itself.

`resolveDatabaseUrl` is intentionally not itself a "provider switch" beyond reading `connectionEnv`/
`defaultUrl` — R5-R7's behavior is identical regardless of `db.provider`'s value, because every supported
Postgres option is the same client protocol (see scope note in `requirements.md`). `db.provider` is kept
in the schema anyway, purely for symmetry with `storage.provider` and so a stage's config is self-
documenting (`"provider": "postgres"` reads clearly next to `storage`'s `"provider": "local-fs"`) — it is
not switched on anywhere in `stage.ts` today. `createStorageAdapter`'s `switch` *does* branch on
`storage.provider` (R9, R11) — that switch, not a new interface, is what a future feature extends to add
e.g. `"supabase-storage"`.

### `src/db/client.ts` (R8, R13)

```ts
import { SQL } from "bun";
import { resolveDatabaseUrl } from "../config/stage";

let client: SQL | undefined;

export function getDb(): SQL {
  client ??= new SQL(resolveDatabaseUrl());
  return client;
}
```

Signature unchanged (`(): SQL`). Every existing caller (`migrate.ts`, `user-service.ts`, `song-service.ts`,
`pedal-service.ts`, `song-pedal-config-service.ts`, `index.ts`) needs no change.

### `src/storage/index.ts` (R12, R13)

```ts
import { createStorageAdapter } from "../config/stage";
import type { StorageAdapter } from "./adapter";

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  adapter ??= createStorageAdapter();
  return adapter;
}
```

Signature unchanged (`(): StorageAdapter`). No caller changes.

### `.env.example`

Add a commented `APP_STAGE` line documenting the default:

```
# APP_STAGE=dev   # dev (default) | staging | main — selects src/config/stages.json's active entry
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gp5_library
STORAGE_DIR=./storage
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
```

Left commented (not uncommented `APP_STAGE=dev`) because R3 already makes `dev` the default when unset —
forcing every `.env` to declare it would contradict "unset means dev" being the actual, tested behavior.

### `docs/architecture.md` (R14, R15, R16)

New section, "Deployment Stages & Provider Configuration", inserted after "Data Flow" and before "What NOT
to do" (stage/provider resolution is a first-class architectural concern, not a footnote):

- The `src/config/stages.json` schema table (`db.provider`/`connectionEnv`/`defaultUrl`,
  `storage.provider`/`dirEnv`/`defaultDir`), with the `dev`/`staging`/`main` entries shown verbatim.
- `APP_STAGE` selection: unset/empty → `dev` (R3); any other unrecognized value throws at `getDb()`'s or
  `getStorage()`'s first call (R4) — this is a startup-time failure, not a request-time one, so it is not
  wrapped in a `SongError`/`AuthError`-style typed HTTP error (those exist to map to a JSON response for
  an in-flight request; `StageConfigError` is meant to crash the process before it ever accepts one).
- Per-stage resolution table: `dev` falls back to `defaultUrl`/`defaultDir` when the named env var is
  unset (R6, R10); `staging`/`main` require `DATABASE_URL` to be set with no fallback (R7) — storage still
  falls back to `defaultDir` for every stage (R10 applies uniformly; a storage directory path is not a
  credential, unlike a DB connection string, so it doesn't need staging/main's stricter "no default"
  treatment).
- **Pointing `staging`/`main` at hosted Supabase Postgres** (R15): in the Supabase project dashboard,
  Project Settings → Database → Connection string (URI, "Session pooler" or "Transaction pooler" per
  Supabase's own guidance for serverless/short-lived connections vs. long-lived ones); set that string as
  the deploy environment's `DATABASE_URL`; run `bun run migrate` once against it before first use — no
  code change, since `bun run migrate` already goes through `getDb()` → `resolveDatabaseUrl()`.
- **Pointing `staging`/`main` at another Docker-hosted Postgres instance**: identical mechanism — start
  the container, set that deploy environment's `DATABASE_URL` to its connection string, run `bun run
  migrate` once. Included for completeness per the feature description's "another Postgres instance via
  Docker" example, even though no `docker-compose.yml` exists in this repo yet (out of scope for this
  feature — it only builds the resolution mechanism, not any particular staging deployment's
  infrastructure).
- **Storage**: every stage resolves to `LocalFsStorageAdapter` as of this feature (R10); explicitly no
  `SupabaseStorageAdapter`/cloud adapter is implemented here — a future feature adds a new `case` to
  `createStorageAdapter`'s switch and a new `storage.provider` value per stage, without touching
  `StorageAdapter`, `getStorage()`, or any caller.
- **Auth decision (R16)**: keep the existing JWT approach (`src/auth/jwt.ts` + `require-auth.ts`); do not
  migrate to Supabase Auth as part of this feature. Rationale: `docs/architecture.md` principle/"What NOT
  to do" already mandates a single consistent auth scheme project-wide (no session/cookie mechanism
  alongside JWT); migrating to Supabase Auth would be a strictly larger, separate rewrite (new user
  identity model, session/token format, `require-auth.ts` rewritten against Supabase's SDK, a migration
  path for existing `users` rows/`password_hash` column) with no acceptance criterion in this feature
  asking for it — and it would apply unevenly, since `dev` and any non-Supabase `staging`/`main` deploy
  has no Supabase project to authenticate against at all. Using Supabase *Postgres* for a stage does not
  require using Supabase *Auth* for that same stage — they are independently selectable products; nothing
  about this feature's DB-provider resolution mechanism forces an auth-scheme change. Revisit only if a
  future feature's acceptance criteria explicitly asks for Supabase Auth.

## Discarded alternatives

**Repo-root `config/stages.json` instead of `src/config/stages.json`.** Rejected: `tsconfig.json`'s
`"include": ["src"]` scopes type-checking to `src/`; a JSON data file consumed only by `src/config/
stage.ts` belongs inside `src/` alongside the code that owns its schema, the same way `src/db/migrations/`
sits inside `src/db/` rather than at the repo root — avoids a config file that resolves fine under Bun's
runtime but sits outside the project's declared TypeScript root.

**Per-stage `.env.<stage>` files** (e.g. `.env.dev`, `.env.staging`, `.env.main`) loaded conditionally by
`APP_STAGE`, instead of one JSON config file with per-stage keys. Rejected: this is exactly the "scattered
ad-hoc env var checks" pattern the feature's own description says to move away from — three parallel flat
files with no shared schema, easy for one to drift out of sync with the others (e.g. `staging` gaining a
key `main` never gets), and `.env`'s flat `KEY=value` shape has no natural way to express a `provider`
discriminator or nested per-field metadata (`connectionEnv` vs. the connection string itself) without
inventing prefixed variable names per stage (`STAGING_DATABASE_URL`, `MAIN_DATABASE_URL`, ...) — which is
the same scattering problem, just alphabetically sorted instead of structurally grouped. A single
structured file with one entry per stage is reviewable in one place (important for seeing at a glance what
`staging`/`main` point to) and gives every stage the same shape by construction.

**Storing the actual Postgres connection string (including credentials) directly in
`src/config/stages.json`** for `staging`/`main`, rather than naming the env var that holds it. Rejected:
`src/config/stages.json` is git-tracked (R1); committing real staging/production credentials to version
control is an obvious secret-leak risk this project has never done for `DATABASE_URL`/`JWT_SECRET` (both
already env-var-only, never in a tracked file) — the config file's job is to declare *how* to resolve a
stage's connection, not to hold the secret itself.

**A single `resolveConfig(stage)` returning `{ db, storage }` together**, instead of separate
`resolveDatabaseUrl`/`createStorageAdapter` functions. Rejected: `getDb()` and `getStorage()` are
independent singletons today (separate modules, separate lazy caches) and R13 requires neither's signature
to change; a combined resolver would force one of them to depend on the other's result being computed
first for no benefit, and would make it harder to unit-test DB resolution (R5-R8) independently of storage
resolution (R9-R12) — the two `*.test.ts` sections in `stage.test.ts` stay fully independent this way.
