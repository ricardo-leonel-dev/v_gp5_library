---
session_id: 25
feature: unknown_routes_return_404
agent: Claude (implementer agent by MiniMax-M3[1m])
started_at: 2026-09-30T21:33:23.000Z
closed_at: 2026-09-30T21:42:50.000Z
---

## Plan
- T1 Create src/middleware/not-found.ts with jsonNotFound
- T2 Create src/middleware/unknown-route-guard.ts with buildPathIndex + createUnknownRouteGuard
- T3 Wire guard + notFound in src/index.ts
- T4-T15 Fixture tests in src/middleware/unknown-route-guard.test.ts
- T16 Integration tests in src/index.test.ts
- T17 Update docs/architecture.md Data Flow
- T18 Run ./init.sh
- T19 Optional pin hono to 4.13.8 (skip if risky)

## Log
- [Claude (implementer agent by MiniMax-M3[1m])] claimed feature 12 unknown_routes_return_404; spec already approved by Ricardo Aguilar; plan recorded; delegating to implementer subagent
- [Claude (implementer agent by MiniMax-M3[1m])] Starting F12 implementation. Read spec files, design.md, tasks.md, existing middleware (cors.ts, protected-router.ts, require-auth.ts) and tests (cors.test.ts, protected-router.test.ts, index.test.ts). Verified Hono 4.13.8 public API: RouterRoute from hono/types, METHOD_NAME_ALL from hono/router, SmartRouter/RegExpRouter/TrieRouter from hono/router/{smart,reg-exp,trie}-router, c.notFound() on Context, app.notFound() on Hono.
- [Claude (implementer agent by MiniMax-M3[1m])] T19 (optional, pin hono to 4.13.8): SKIPPED. Per the spec instructions 'Only do this if it doesn't risk breaking other features; otherwise leave it and note the omission in the log.' Pinning hono is a tracked-files change (package.json + bun.lock) outside this feature's strict scope and the existing tests already pin behavior to 4.13.8 implicitly via the dist code paths; left as-is.
- [Claude (implementer agent by MiniMax-M3[1m])] Implementation complete: 189/0 tests pass, all T1-T18 checked off (T19 skipped as OPTIONAL), wrote handoff to progress/implementer_feature12.md. Awaiting reviewer.
- [Claude (implementer agent by MiniMax-M3[1m])] reviewer verdict: APPROVED. All R1-R19 verified against actual test code; design conformance pass; no regression in feature 1 (protected-router) or feature 11 (cors); docs/architecture.md Data Flow updated; T19 (hono pin) skipped per OPTIONAL designation. ./init.sh final: 189 pass / 0 fail / 485 expect() calls across 13 files. Ready to log out.

## Next Step

## Verification
bun test: 189 pass / 0 fail / 485 expect() calls across 13 files (was 162/0/439 before this feature; +27 new tests: 21 fixture tests in src/middleware/unknown-route-guard.test.ts, 6 integration tests in src/index.test.ts). ./init.sh exits Environment ready. Feature 1's protected-router.test.ts (6/0) and feature 11's cors.test.ts (11/0) pass unchanged. Single [WARN] from init.sh step 6 (PGRST125 bootstrap_project sync) is the pre-existing Supabase mirror warning carried forward from feature 11, not caused by this feature.

## Closure
feature 12 unknown_routes_return_404 implemented and reviewed: backend now returns 404 {"error":"Not found"} (JSON, not text/plain) for any unknown-path request, with or without an Authorization header (R1-R5). Method-mismatch requests on a known path (e.g. PUT /songs) keep their existing behaviour: 401 without a valid token (R6-R7), and the JSON 404 only after auth passes - no 405 (R8). Regression tests confirm feature 1's protected-router behaviour (R9-R14) and feature 11's CORS wiring (R15-R16) are intact, and public routes still answer non-401 non-404 (R17). Trailing-slash (R18) and middleware-only (R19) edge cases covered. Implementation uses an app-level unknown-route guard registered immediately after CORS, with a SmartRouter+RegExpRouter+TrieRouter path index built lazily on first dispatch from the app's own routes array. require-auth.ts and protected-router.ts untouched per design. T19 (optional hono pin to 4.13.8) intentionally skipped per its OPTIONAL scope.
