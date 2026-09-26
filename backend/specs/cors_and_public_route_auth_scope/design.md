# Design — cors_and_public_route_auth_scope

Conventions (layers, naming, test colocation, `bun:test`, no new npm deps) follow `docs/architecture.md`
and `docs/conventions.md`; this file only records choices made within them.

## Files to touch

| File | Change |
| --- | --- |
| `src/config/stages.json` | Add a `cors` section to every stage (R1, R3, R4). |
| `src/config/stage.ts` | Add `CorsProviderConfig`, extend `StageConfig`, add `resolveAllowedOrigins()` (R2-R5). |
| `src/config/stage.test.ts` | Add `cors` to `makeFixture()`; unit tests for `resolveAllowedOrigins` (R2-R5). |
| `src/middleware/cors.ts` (new) | `createCorsMiddleware(allowedOrigins)` wrapping `hono/cors` (R6-R15). |
| `src/middleware/cors.test.ts` (new) | Middleware tests on a minimal fixture app, no DB (R6-R18). |
| `src/index.ts` | Register the CORS middleware as the first middleware on `app` (R6-R18). |
| `src/index.test.ts` | End-to-end tests against the real `app` (R6, R7, R10, R11, R12). |
| `.env.example` | Document `CORS_ALLOWED_ORIGINS` as a commented line (R2). |
| `docs/architecture.md` | Add `cors` to the `stages.json` schema table/example and a CORS step to "Data Flow" (R1). |

`src/middleware/require-auth.ts` and `src/middleware/protected-router.ts` are **not** modified. Feature 1's
existing tests in `protected-router.test.ts` must still pass unchanged (R16-R18).

`hono/cors` ships inside the already-installed `hono` package (4.13.x), so this adds no dependency
(architecture principle 2).

## `src/config/stages.json` (R1, R3, R4)

Add to each stage:

```json
"dev":     { ..., "cors": { "allowedOriginsEnv": "CORS_ALLOWED_ORIGINS", "defaultOrigins": ["http://localhost:4200"] } },
"staging": { ..., "cors": { "allowedOriginsEnv": "CORS_ALLOWED_ORIGINS" } },
"main":    { ..., "cors": { "allowedOriginsEnv": "CORS_ALLOWED_ORIGINS" } }
```

This mirrors feature 10's `db` rule: `dev` has a safe local default, `staging`/`main` have none and
must be configured explicitly. A deploy that forgets `CORS_ALLOWED_ORIGINS` fails at startup (R4)
instead of silently rejecting every browser call from the real frontend.

## `src/config/stage.ts` (R2-R5)

```ts
export interface CorsProviderConfig {
  allowedOriginsEnv: string;
  defaultOrigins?: string[];
}
export interface StageConfig {
  db: DbProviderConfig;
  storage: StorageProviderConfig;
  cors: CorsProviderConfig;
}

export function resolveAllowedOrigins(
  stage: Stage = getActiveStage(),
  config: StagesFile = stagesConfig as StagesFile,
  env: NodeJS.ProcessEnv = process.env,
): string[];
```

Same `(stage, config, env)` shape and defaults as `resolveDatabaseUrl`/`resolveStorageDir`, so tests
inject fixtures without touching `process.env`. Algorithm:

1. `raw = env[allowedOriginsEnv]`. If non-empty: split on `,`, `trim()` each, drop empty strings (R2).
2. Else if `defaultOrigins !== undefined`: use a copy of it (R3).
3. Else throw `StageConfigError(\`stage "${stage}" requires "${allowedOriginsEnv}" to be set (no default configured)\`)`
   — same message shape as the existing two resolvers (R4).
4. If the resulting list includes `"*"`, throw `StageConfigError` naming `"*"` and explaining that a
   wildcard is not allowed because requests carry `Authorization` (R5).

Edge case: an env value made only of commas/whitespace (e.g. `" , "`) is non-empty, so step 1 applies and
yields `[]`. An empty list is valid: every cross-origin request is then denied (R13). It is not treated as
"unset", so it does not fall back to `defaultOrigins` — the operator explicitly set the variable.

## `src/middleware/cors.ts` (R6-R15)

```ts
import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

export function createCorsMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler {
  const origins = [...allowedOrigins];
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Authorization", "Content-Type"],
    exposeHeaders: ["Content-Disposition"],
  });
}
```

How `hono/cors` 4.13 behaves with these options (verified in `node_modules/hono/dist/middleware/cors`):

- For **every** `OPTIONS` request it returns `204` directly without calling `next()` (R6, R10). It sets
  `Access-Control-Allow-Origin` only when the origin callback returns a value (R7, R13), and always sets
  `Allow-Methods`/`Allow-Headers` from the explicit lists (R8, R9). An explicit `allowHeaders` is used
  instead of hono's default, which echoes whatever `Access-Control-Request-Headers` the client sends.
- For non-`OPTIONS` requests it sets `Access-Control-Allow-Origin` (when allowed) and
  `Access-Control-Expose-Headers` on `c.res` **before** `await next()`. Hono's `Context` copies headers
  already on `c.res` into later responses built with `c.json()`/`c.body()`, which is how the header
  reaches both route responses (R11, R14) and `requireAuth`'s early `401` (R12).
- `credentials` is left unset, so `Access-Control-Allow-Credentials` is never emitted (R15). Auth is a
  Bearer header, not a cookie (architecture "What NOT to do": no cookie mechanism), so credentialed CORS
  is not needed.
- Because `origin` is not `"*"`, hono appends `Vary: Origin`, so shared caches do not serve one origin's
  response to another. This is library behavior and is not a separate requirement.
- `Content-Disposition` is exposed because `GET /songs/:id/files/:kind` sets
  `Content-Disposition: attachment; filename="..."`, and browser JS cannot read that header on a
  cross-origin response unless it is exposed.

`allowMethods` lists the verbs the API uses (`GET`, `POST`, `DELETE`) plus `PUT`/`PATCH`, so a future
update route does not need a CORS change. `OPTIONS` is omitted: preflight never needs to list it.

## `src/index.ts` wiring

```ts
import { resolveAllowedOrigins } from "./config/stage";
import { createCorsMiddleware } from "./middleware/cors";

const app = new Hono<{ Variables: AuthVariables }>();
app.use("*", createCorsMiddleware(resolveAllowedOrigins()));
// ...existing routes unchanged...
app.route("/", protectedRouter);
```

It **must** be the first `app.use`/route registration. Hono runs handlers in registration order, so
registering it before `app.route("/", protectedRouter)` guarantees that `OPTIONS` requests are answered
before `requireAuth` runs (R6, R10), and that the `Access-Control-*` headers are already on `c.res` when
`requireAuth` returns its `401` (R12).

`resolveAllowedOrigins()` runs **once, at module load**, not per request. This makes a misconfigured
`staging`/`main` deploy (R4/R5) crash before it accepts any request, the same startup-failure role
`StageConfigError` already has in `docs/architecture.md`.

## Error paths

| Condition | Result |
| --- | --- |
| Non-dev stage, `CORS_ALLOWED_ORIGINS` unset/empty | `StageConfigError` at `src/index.ts` import → process fails to start (R4) |
| `CORS_ALLOWED_ORIGINS` contains `*` | `StageConfigError` at import (R5) |
| Request from a non-allowed origin | Processed normally, no `Access-Control-Allow-Origin`; the browser blocks JS from reading the response (R13). Not a server-side error. |
| Preflight from a non-allowed origin | `204` without `Access-Control-Allow-Origin`; the browser aborts the real request (R10, R13). |
| Non-`OPTIONS` protected request without a valid token | Unchanged `401` from `requireAuth`, now with CORS headers when the origin is allowed (R12, R16, R17). |

`StageConfigError` stays a startup error, not an HTTP-mapped domain error (no `status` field, no route
catches it), as in feature 10.

## Testing strategy

- **`stage.test.ts`**: pure unit tests of `resolveAllowedOrigins` with fixture `StagesFile` and a fixture
  env object (R2-R5). `makeFixture()` gets a `cors` section per stage so it still satisfies `StageConfig`.
- **`cors.test.ts`**: builds a fixture app that mirrors `index.ts`'s shape without a DB:
  `new Hono()` → `app.use("*", createCorsMiddleware(["http://allowed.test"]))` → a public
  `app.post("/public", ...)` → `createProtectedRouter()` with a `GET /private` route →
  `app.route("/", router)`. It covers R6-R9 and R10-R18, using `issueToken` for valid/expired tokens the
  same way `protected-router.test.ts` does. No DB and no `.env` dependence.
- **`index.test.ts`**: a few end-to-end checks against the real exported `app` (R6, R7, R10, R11, R12):
  preflight to `/auth/register` and `/songs`, a real `POST /auth/login` with bad credentials (401/400
  from the handler, not `requireAuth`, still carrying `Access-Control-Allow-Origin`), and a
  `GET /songs` without a token. The allowed origin used in these tests is read from
  `resolveAllowedOrigins()[0]` rather than hard-coded to `http://localhost:4200`. Bun auto-loads `.env`,
  so a developer whose local `.env` sets `CORS_ALLOWED_ORIGINS` differently would otherwise get false
  failures.

## Discarded alternatives

1. **Make `requireAuth` (or `createProtectedRouter`) skip `OPTIONS` requests.** Rejected. It stops the
   `401` but emits no `Access-Control-*` headers, so the browser still rejects the preflight and CORS
   still has to be added anyway. It also adds a method-based bypass inside the auth middleware that is
   easy to widen by accident later. With CORS registered first, `OPTIONS` never reaches `requireAuth`, so
   the auth code stays unconditional.
2. **Change `protectedRouter`'s mount point or scope `requireAuth` per route** (e.g. mount at a `/api`
   prefix, or stop using `use("*")`). Rejected for this feature. It fixes the preflight problem only
   indirectly, rewrites every protected route and feature 1's R1 guarantee ("applies requireAuth to
   every registered route without a per-route argument"), changes public URLs the frontend already
   calls, and still needs CORS headers on top.
3. **`origin: "*"` (wildcard).** Rejected per the acceptance criteria. A wildcard can never be combined
   with credentials, would let any site call an API that holds per-user data, and makes the configured
   allow-list meaningless. R5 turns an accidental `*` in the env var into a startup failure.
4. **Resolve allowed origins per request** (calling `resolveAllowedOrigins()` inside the `origin`
   callback). Rejected. Misconfiguration would appear only as a 500 on the first cross-origin request
   instead of a failure at startup, and it re-parses env on every request for a value that cannot change
   during the process lifetime.
5. **Env var only, no `stages.json` entry** (e.g. `process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:4200"`
   in `index.ts`). Rejected. It skips the per-stage pattern feature 10 established (the acceptance
   criteria require following it) and gives `staging`/`main` the same laptop-origin fallback that
   feature 10 deliberately forbids for the DB URL.
6. **Empty list (deny all) instead of `StageConfigError` for non-dev stages without the env var.**
   Considered but not chosen: it fails silently, surfacing only as browser console CORS errors in a
   deployed frontend. This was flagged for the human reviewer at approval time as the main alternative
   they may prefer. Switching to it would mean replacing R4 and giving `staging`/`main`
   `"defaultOrigins": []`.
