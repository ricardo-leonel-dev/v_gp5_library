---
session_id: 34
feature: email_lowercase_normalization
agent: leader -> spec_author (Opus 5.5)
started_at: 2026-10-03T22:22:23.000Z
closed_at: 2026-10-03T22:27:27.000Z
---

## Plan
- Read feature 18, docs, F16 spec and auth/admin/migration code
- Decide normalization helper, migration collision policy, index/constraint, soft-delete scope
- Write requirements.md (decisions + EARS R ids)
- Write design.md (files, signatures, migration SQL, alternatives, test impact)
- Write tasks.md with R traceability
- mark-spec-ready

## Log
- [leader -> spec_author (Opus 5.5)] Read code: register checks existence without deleted_at filter (soft-deleted block re-registration, consistent with full UNIQUE(email)); login also does not filter deleted_at (pre-existing, out of scope). index.test.ts R36 test asserts upper-cased lookup -> 404, will flip. migrate.test.ts filename list needs 0007. F19 only exports UserRow; put helper in new src/auth/email.ts to avoid conflict.
- [leader -> spec_author (Opus 5.5)] Drafted specs/email_lowercase_normalization/{requirements,design,tasks}.md: 22 R, 19 T; decisions D1-D16 (helper in new src/auth/email.ts, lower(email) predicates, migration 0007 fails loudly on collision incl. soft-deleted, unique index on lower(email), drop users_email_key, no CHECK, 23505->409).

## Next Step

## Verification


## Closure

