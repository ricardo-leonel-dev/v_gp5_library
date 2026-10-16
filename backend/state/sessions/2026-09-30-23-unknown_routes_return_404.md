---
session_id: 23
feature: unknown_routes_return_404
agent: leader -> spec_author (claude-opus-5-5)
started_at: 2026-09-30T21:12:09.000Z
closed_at: 2026-09-30T21:14:16.000Z
---

## Plan
- Read feature 12, feature 1/11 specs and router/auth/cors code
- Confirm Hono 4.13.8 matching semantics (use() is ALL, matchedRoutes, OPTIONS in cors, HEAD->GET)
- Write requirements.md (EARS)
- Write design.md with open questions + discarded alternatives
- Write tasks.md traced to R ids
- mark-spec-ready

## Log
- [leader -> spec_author (claude-opus-5-5)] Root cause confirmed: createProtectedRouter use('*', requireAuth) mounted at '/' runs before Hono's notFound; also with a valid token Hono's default notFound returns text/plain '404 Not Found', not JSON. hono 4.13.8: use() routes register as METHOD_NAME_ALL, c.req.matchedRoutes exposes the full match list; cors answers every OPTIONS with 204 before routing.
- [leader -> spec_author (claude-opus-5-5)] Wrote requirements.md (R1-R14)
- [leader -> spec_author (claude-opus-5-5)] Wrote design.md (approach: gate requireAuth on non-ALL matchedRoutes from hono/route + JSON app.notFound; 5 discarded alternatives; open questions Q1-Q5) and tasks.md (T1-T17, every R1-R14 covered)

## Next Step

## Verification


## Closure

