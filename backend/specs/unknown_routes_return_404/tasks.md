# Tasks — unknown_routes_return_404

Implement in order. Tests go next to the code they cover (`*.test.ts` in `src/`), per existing layout.
Unit tests of the guard use a fixture app (no DB) in the new `src/middleware/unknown-route-guard.test.ts`,
mirroring `cors.test.ts`'s `buildFixtureApp` pattern, in this registration order:
`cors([ALLOWED_ORIGIN])` -> `createUnknownRouteGuard(() => app.routes)` -> public `POST /public` ->
`createProtectedRouter()` with `GET /private`, `GET /private/:id` -> `app.route("/", protectedRouter)` ->
`app.notFound(jsonNotFound)`. Also add `app.use("/mw-only/*", <pass-through middleware>)` on the fixture
app with no handler under `/mw-only`. Integration tests against the real app go in `src/index.test.ts`.
Do not modify `src/middleware/require-auth.ts`, `src/middleware/protected-router.ts`, or the existing
feature 1/11 tests.

- [x] T1 (R5) Create `src/middleware/not-found.ts` exporting `jsonNotFound`, returning
  `c.json({ error: "Not found" }, 404)`.
- [x] T2 (R1, R2, R3, R4, R6, R7, R8, R14, R18, R19) Create `src/middleware/unknown-route-guard.ts`
  exporting `buildPathIndex(routes)` and `createUnknownRouteGuard(getRoutes)` exactly as in design.md §2
  (SmartRouter over RegExpRouter+TrieRouter, every non-`METHOD_NAME_ALL` route re-added under
  `METHOD_NAME_ALL`, index built once on first request, `c.notFound()` when the path is unknown). Doc
  comment must state the `app.all(...)` limitation (design.md Q-A).
- [x] T3 (R1, R2, R5, R15) In `src/index.ts`, register
  `app.use("*", createUnknownRouteGuard(() => app.routes))` immediately after the CORS middleware and
  `app.notFound(jsonNotFound)`.
- [x] T4 (R1, R5) Fixture tests: `GET /nope` with no `Authorization` -> 404, body `{"error":"Not found"}`,
  `Content-Type` starts with `application/json`; `GET /private/abc/zzz` with no header -> 404 (a `:param`
  matches one segment only).
- [x] T5 (R2, R5) Fixture test: `GET /nope` with a valid Bearer token -> 404, JSON body
  `{"error":"Not found"}`.
- [x] T6 (R3) Fixture test: `GET /nope` with `Authorization: Basic xyz` -> 404.
- [x] T7 (R4) Fixture tests: `GET /nope` with an expired token -> 404; with a tampered-signature token
  -> 404 (reuse the tampering helper pattern from `protected-router.test.ts`).
- [x] T8 (R6, R7) Fixture tests: `PUT /private` (only `GET /private` registered) with no header -> 401
  `{"error":"Token required"}`; with an expired token -> 401 `{"error":"Invalid or expired token"}`;
  `PUT /public` (only `POST /public` registered) with no header -> 401.
- [x] T9 (R8, R5) Fixture test: `PUT /private` with a valid Bearer token -> 404 (assert status is not
  405), JSON body `{"error":"Not found"}`.
- [x] T10 (R9, R10) Fixture tests: `GET /private` with no header -> 401 `{"error":"Token required"}`;
  with an expired token -> 401 `{"error":"Invalid or expired token"}`.
- [x] T11 (R11) Fixture test: `GET /private/abc` with no header -> 401.
- [x] T12 (R12) Fixture test: `HEAD /private` with no header -> 401.
- [x] T13 (R13, R14) Fixture test: after building the fixture (guard already installed), a route
  registered only via `protectedRouter.get("/late", ...)` before `app.route(...)` -> no header 401, valid
  token -> 200 with `userId` equal to the token subject. Confirm the existing feature 1 tests in
  `protected-router.test.ts` still pass unchanged.
- [x] T14 (R15, R16) Fixture tests: `GET /nope` with `Origin: <allowed>` -> 404 and
  `Access-Control-Allow-Origin` equal to that origin; `OPTIONS /nope` with `Origin: <allowed>` and
  `Access-Control-Request-Method: GET` -> 204.
- [x] T15 (R18, R19) Fixture tests: `GET /private/` with no header -> 404; `GET /mw-only/x` with no
  header -> 404; unit test that `buildPathIndex` over a routes array containing only method-`ALL` entries
  (`/*`, `/mw-only/*`) returns `false` for `/`, `/anything` and `/mw-only/x`.
- [x] T16 (R1, R2, R5, R6, R8, R9, R17) Integration tests in `src/index.test.ts` against the real `app`:
  `GET /definitely-not-a-route` with no token -> 404 JSON `{"error":"Not found"}`; same with a valid
  token -> 404 JSON; `PUT /songs` with no token -> 401; `PUT /songs` with a valid token -> 404 JSON;
  `GET /songs` with no token -> 401 (regression); `POST /auth/login` with an empty JSON body and no token
  -> neither 401 nor 404 (expect 400).
- [x] T17 (R1, R6) Update `docs/architecture.md` Data Flow per design.md §4.
- [x] T18 (R1-R19) Run `bun test` (`./init.sh`); all feature 1 and feature 11 tests
  (`protected-router.test.ts`, `cors.test.ts`, the CORS/auth blocks in `index.test.ts`) pass unchanged.
- [ ] T19 (R6, R7, R8, R14, R18, R19) **OPTIONAL — human may delete this task at approval (design.md
  D5).** Pin `hono` to the exact version `4.13.8` in `package.json` (`"hono": "4.13.8"`, no caret), run
  `bun install` to refresh `bun.lock`, and re-run T18. If this line is still present when implementation
  starts, it is in scope.
