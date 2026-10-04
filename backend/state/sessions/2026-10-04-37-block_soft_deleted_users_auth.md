---
session_id: 37
feature: block_soft_deleted_users_auth
agent: leader -> spec_author (claude-opus-5-5)
started_at: 2026-10-04T04:18:31.000Z
closed_at: 2026-10-04T04:21:31.000Z
---

## Plan
- Read docs + F1/F18 specs
- Study auth code, middleware, tests
- Write requirements.md
- Write design.md with option analysis
- Write tasks.md
- mark-spec-ready

## Log
- [leader -> spec_author (claude-opus-5-5)] Studied code: login has no deleted_at filter; requireAuth only verifies JWT; requireAdmin already does per-request role lookup with deleted_at filter; c.get('plan') is unused; several tests (protected-router, cors, unknown-route-guard, require-admin, /me/plan R26) use tokens for non-existent users and will need updating
- [leader -> spec_author (claude-opus-5-5)] Drafted specs/block_soft_deleted_users_auth: 15 EARS reqs, design weighs per-request lookup vs token_version/denylist/short TTL/cache (chose per-request PK lookup), 13 tasks; supersedes F16 R6 (deleted/missing caller 403->401) and F14 R26 (/me/plan missing user 404->401)

## Next Step

## Verification


## Closure

