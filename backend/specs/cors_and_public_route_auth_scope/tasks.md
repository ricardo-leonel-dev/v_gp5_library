# Tasks — cors_and_public_route_auth_scope

- [x] T1 (R1, R3, R4) Add a `cors` section to every stage in `src/config/stages.json`:
      `dev` → `{ "allowedOriginsEnv": "CORS_ALLOWED_ORIGINS", "defaultOrigins": ["http://localhost:4200"] }`;
      `staging`/`main` → `{ "allowedOriginsEnv": "CORS_ALLOWED_ORIGINS" }` (no `defaultOrigins`).
- [x] T2 (R1) In `src/config/stage.ts`, add the `CorsProviderConfig` interface and a required `cors` field
      on `StageConfig`. Update `makeFixture()` in `src/config/stage.test.ts` so every stage has a `cors`
      section (existing tests must stay green).
- [x] T3 (R2, R3, R4, R5) In `src/config/stage.ts`, add
      `resolveAllowedOrigins(stage, config, env): string[]` per `design.md`: non-empty env → split on `,`,
      trim, drop empties; else `defaultOrigins` copy; else throw `StageConfigError` naming the stage and
      env var; then throw `StageConfigError` if the list contains `"*"`.
- [x] T4 (R2) Add `stage.test.ts` tests for `resolveAllowedOrigins`:
      env `" http://a.test , ,http://b.test "` → `["http://a.test", "http://b.test"]`. Add a second test
      showing a non-empty env value overrides `dev.defaultOrigins`.
- [x] T5 (R3) Add a `stage.test.ts` test: stage `dev`, env missing `CORS_ALLOWED_ORIGINS` (and a second
      case with it set to `""`) → returns the fixture's `dev.cors.defaultOrigins`. Add one assertion
      against the real `src/config/stages.json` that `dev.cors.defaultOrigins` equals
      `["http://localhost:4200"]`.
- [x] T6 (R4) Add two `stage.test.ts` tests: stages `staging` and `main`, env missing
      `CORS_ALLOWED_ORIGINS`, fixture with no `defaultOrigins` → throws `StageConfigError` whose message
      contains the stage name and `"CORS_ALLOWED_ORIGINS"`.
- [x] T7 (R5) Add a `stage.test.ts` test: env `"http://a.test,*"` → throws `StageConfigError` whose
      message contains `"*"`.
- [x] T8 (R6, R7, R8, R9, R11, R12, R13, R14, R15) Create `src/middleware/cors.ts` exporting
      `createCorsMiddleware(allowedOrigins: readonly string[]): MiddlewareHandler`, wrapping `hono/cors`
      with the exact options in `design.md` (origin callback over the allow-list; `allowMethods`
      `GET,POST,PUT,PATCH,DELETE`; `allowHeaders` `Authorization,Content-Type`; `exposeHeaders`
      `Content-Disposition`; no `credentials`).
- [x] T9 (R6, R10, R11, R12, R16, R17, R18) In `src/index.ts`, register
      `app.use("*", createCorsMiddleware(resolveAllowedOrigins()))` directly after `new Hono(...)` and
      before every route and before `app.route("/", protectedRouter)`. Do not modify
      `require-auth.ts` or `protected-router.ts`.
- [x] T10 (R6, R7, R8, R9) Create `src/middleware/cors.test.ts` with the DB-free fixture app described in
      `design.md` (allowed origin `http://allowed.test`, public `POST /public`, protected `GET /private`).
      Add a test that a preflight `OPTIONS /public` with `Origin: http://allowed.test` and
      `Access-Control-Request-Method: POST` returns `204`, `Access-Control-Allow-Origin` equal to
      `http://allowed.test`, `Allow-Methods` containing each of `GET,POST,PUT,PATCH,DELETE`, and
      `Allow-Headers` containing `Authorization` and `Content-Type`.
- [x] T11 (R6, R7, R10) In `cors.test.ts`, add a test that a preflight `OPTIONS /private` (with
      `Access-Control-Request-Headers: authorization`, no `Authorization` header) from the allowed origin
      returns `204` (not `401`) with `Access-Control-Allow-Origin` equal to the origin.
- [x] T12 (R10, R13) In `cors.test.ts`, add a test that `OPTIONS /private` from a non-allowed origin
      (`http://evil.test`), and a second request with no `Origin` header at all, each return a status
      other than `401` and have no `Access-Control-Allow-Origin` header.
- [x] T13 (R11, R14) In `cors.test.ts`, add a test that `POST /public` from the allowed origin returns the
      handler's response with `Access-Control-Allow-Origin` equal to the origin and
      `Access-Control-Expose-Headers` containing `Content-Disposition`.
- [x] T14 (R13) In `cors.test.ts`, add a test that `POST /public` from `http://evil.test` has no
      `Access-Control-Allow-Origin` header.
- [x] T15 (R12, R16) In `cors.test.ts`, add a test that `GET /private` from the allowed origin with no
      `Authorization` header returns `401`, body `{"error":"Token required"}`, and
      `Access-Control-Allow-Origin` equal to the origin.
- [x] T16 (R17) In `cors.test.ts`, add tests that `GET /private` from the allowed origin with an expired
      token (`issueToken(..., "-10s")`) and with a non-Bearer `Authorization` value return `401` with the
      same bodies `requireAuth` produces today (`"Invalid or expired token"` / `"Token required"`).
- [x] T17 (R18) In `cors.test.ts`, add a test that `GET /private` with a valid token returns the same
      status and body with an allowed `Origin` header as without one.
- [x] T18 (R15) In `cors.test.ts`, add a test asserting that no `Access-Control-Allow-Credentials` header
      is present on the preflight response (T10's request) or on the real response (T13's request).
- [x] T19 (R6, R7, R10, R11, R12) In `src/index.test.ts`, add end-to-end tests against the real `app`,
      using `resolveAllowedOrigins()[0]` as the allowed origin:
      preflight `OPTIONS /auth/register` → `204` with `Access-Control-Allow-Origin`;
      preflight `OPTIONS /songs` → `204` (not `401`);
      `POST /auth/login` with an empty JSON body → handler's `400` with `Access-Control-Allow-Origin`;
      `GET /songs` without a token → `401` with `Access-Control-Allow-Origin`.
- [x] T20 (R2, R4) Add a commented line `# CORS_ALLOWED_ORIGINS=http://localhost:4200   # comma-separated; required for staging/main`
      to `.env.example`. It must be commented out so it does not override the `dev` default for anyone
      who copies the file. Keep the file's existing uncommitted `DATABASE_URL` port change intact and do
      not revert it.
- [x] T21 (R1) Update `docs/architecture.md`: add the `cors` fields (`allowedOriginsEnv`,
      `defaultOrigins`) to the `stages.json` schema table and example, add a per-stage CORS row to the
      resolution rules, and add a `cors middleware (all paths, answers OPTIONS)` step before
      `requireAuth` in "Data Flow".
- [x] T22 (R1-R18) Run `bun test` (the `verify_command`). All new and pre-existing tests must pass,
      including feature 1's `protected-router.test.ts` without modification.
