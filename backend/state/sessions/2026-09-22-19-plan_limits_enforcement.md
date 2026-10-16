---
session_id: 19
feature: plan_limits_enforcement
agent: unknown
started_at: 2026-09-22T06:55:31.000Z
closed_at: 2026-09-22T07:00:22.000Z
---

## Plan
- Read docs/specs.md, architecture.md, conventions.md, CHECKPOINTS.md
- Explore users/plan schema, JWT, song-service.ts createSong flow, related done specs
- Draft requirements.md (EARS, R1-R7)
- Draft design.md (files to touch, signatures, discarded alternatives)
- Draft tasks.md (T1-T10 mapped to R<n>)
- mark-spec-ready

## Log
- [unknown] Explored existing schema/code: users.plan already exists (0001_init.sql, default 'free'), already carried in JWT (issueToken) but unused for any enforcement. Confirmed POST /songs (song-service.ts createSong) is the only song-creation path (song_file_export_import's own spec confirms 'import' reuses this same route). Reviewed song_crud_api and song_metadata_and_extra_config specs for house style (EARS phrasing, SongError pattern, MAX_EXTRA_CONFIG_BYTES precedent for a feature-local constant) and stage_aware_provider_config's design.md for discarded-alternatives style.
- [unknown] Drafted requirements.md: R1 (under-limit free-plan create succeeds), R2 (at/over-limit free-plan create -> 402, no rows), R3 (error message names plan+limit), R4 (non-free plans unlimited), R5 (soft-deleted songs excluded from count), R6 (plan read fresh from DB, not JWT claim), R7 (missing users row -> 404).
- [unknown] Drafted design.md: enforcement lives entirely in src/songs/song-service.ts's createSong (no schema change, no new route); adds PLAN_SONG_LIMITS constant (mirrors MAX_EXTRA_CONFIG_BYTES precedent rather than a new src/config/ module), widens SongError.status to include 402, moves 'const db = getDb()' earlier, inserts plan+count check before any storage.put call. Documented 4 discarded alternatives: FOR UPDATE row-locking transaction (rejected as over-engineering for this low-priority feature), trusting JWT's plan claim (rejected, stale for up to 7d), a separate src/config/plan-limits.ts module (rejected, premature abstraction ahead of a second consumer), and 403 instead of 402 (rejected, 402 is more semantically precise).
- [unknown] Drafted tasks.md: T1-T3 implementation (DB plan lookup+404, limit constant+count check+402, SongError type widening), T4-T8 song-service.test.ts unit tests (one per R1,R2/R3,R4,R5,R7), T9-T10 index.test.ts HTTP-level tests (R2/R3 reachability, R6 DB-over-JWT precedence). Every R1-R7 covered by at least one task.

## Next Step

## Verification


## Closure

