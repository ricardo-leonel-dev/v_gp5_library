---
session_id: 2
feature: require_auth_middleware_on_all_routes
agent: Claude (implementer agent by MiniMax-M3[1m])
started_at: 2026-09-21T05:29:11.000Z
closed_at: 2026-09-21T05:44:20.000Z
---

## Plan
- T1: Add optional expiresIn parameter to issueToken (R7)
- T2: Create src/middleware/protected-router.ts with factory + shared instance (R1)
- T3: Update src/index.ts to mount protectedRouter and migrate /auth/logout + /auth/me onto it (R8, R9)
- T4: Write src/middleware/protected-router.test.ts covering R1-R6
- T5: Add expired/tampered-token regression tests to auth.test.ts (R4, R5)
- T6: Add R10 userId-spoof test to auth.test.ts
- Verify: run ./init.sh and check bun test passes
- Write progress/impl_require_auth_middleware_on_all_routes.md with R<n> -> test traceability

## Log
- [Claude (Claude (implementer agent by MiniMax-M3[1m]) agent by MiniMax-M3[1m])] Baseline init.sh passes (9 tests, 3 files). Starting T1: extend issueToken with expiresIn.
- [Claude (Claude (implementer agent by MiniMax-M3[1m]) agent by MiniMax-M3[1m])] Implementation complete: T1-T6 done, 18/18 tests pass, init.sh green. Handoff at progress/impl_require_auth_middleware_on_all_routes.md.

## Next Step

## Verification
18/18 tests green across 4 files; stable over multiple back-to-back runs; ./init.sh green; C1-C6 incl. C6 all [x] per reviewer; R<n>->test traceability verified directly; D1 deviation documented and judged legitimate strict improvement.

## Closure
Feature 1 require_auth_middleware_on_all_routes implemented: all 6 T<n> tasks complete, all 10 R<n> requirements tested. protected-router middleware factory + instance now gate every song/pedal route; /auth/logout and /auth/me moved onto it; /health, /auth/register, /auth/login remain on app. issueToken accepts optional expiresIn. Reviewer approved without required changes.
