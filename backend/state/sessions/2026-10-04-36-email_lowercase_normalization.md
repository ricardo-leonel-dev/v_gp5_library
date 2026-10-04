---
session_id: 36
feature: email_lowercase_normalization
agent: implementer
started_at: 2026-10-04T03:16:47.000Z
closed_at: 2026-10-04T04:08:16.000Z
---

## Plan
- T1-T2 normalizeEmail + unit tests
- T3-T7 service/set-role changes
- T8 migration 0007
- T9-T17 tests
- T18 docs pointer
- T19 dev DB collision check, migrate, init.sh

## Log
- [implementer] Probed dev DB: unique constraint name is users_email_key (as designed); Bun 1.4.2 PostgresError carries SQLSTATE in errno ('23505'), code is ERR_POSTGRES_SERVER_ERROR; pre-migration non-normalized count (email <> lower(btrim(email, ws))) = 4476 (spec estimated ~4260); case-insensitive collision groups = 0.
- [implementer] T1-T13 done: src/auth/email.ts + test, register/login/findUserByEmail/setUserRoleByEmail use normalizeEmail + lower(email), 23505->409 in register, migration 0007 (verbatim from design), migrate tests R15-R22. Bun tx.savepoint works for R18/R19 test.
- [implementer] T19: dev DB migrated with 0007 (applied first by migrate.test.ts's migrate() call, then bun run migrate = no-op). Pre: 4476 non-normalized rows, 0 collision groups. Post: SELECT COUNT(*) FROM users WHERE email <> lower(btrim(email, ws)) = 0. No collision error.
- [implementer] Per leader: fast-forwarded branch onto origin/dev 81f9d9f (F19 merged: export type UserRow). Stash pop applied cleanly; F18 changes coexist with F19's export; no conflicts in user-service/plan-service/index.test.
- [implementer] T14-T18 done: auth.test.ts normalization+race tests, index.test.ts R36 test drops upper-case candidate (renamed) + R11/R12 tests, set-role.test.ts R13/R14, docs/architecture.md pointer section (untracked docs). Full bun test: 315 pass.
- [implementer] init.sh green (315 pass); handoff written to progress/impl_email_lowercase_normalization.md. Mirror sync [WARN] bootstrap_project sync failed (HTTP 404 PGRST125), non-fatal.
- REVIEW (approved): F18 verified: 4 call sites normalized, 0007 atomic/re-runnable, R1-R22 traced, 315 pass
- [implementer] Pre-log-out init.sh: first run had 1 failing test (314/315), test name not captured; 6 bun test reruns + a second init.sh all 315/315 green. Suspected cause: another test run hitting the same shared dev DB at the same time (not confirmed). Flagged to leader.

## Next Step

## Verification
./init.sh green, bun test 315 pass / 0 fail (one earlier init.sh run had 1 failure that did not reproduce in 7 reruns); dev DB migrated with 0007: 0 collisions, non-normalized rows 4476 -> 0; R1-R22 each mapped to a test in progress/impl_email_lowercase_normalization.md

## Closure
Emails are now normalized with trim + lowercase (normalizeEmail in src/auth/email.ts) in register, login, admin lookup and set-role; register maps a concurrent 23505 to 409; migration 0007 normalizes existing rows, aborts on collisions (runbook in its header) and replaces users_email_key with users_email_lower_key. Reviewer approved. Rebased onto origin/dev 81f9d9f. Not committed.
