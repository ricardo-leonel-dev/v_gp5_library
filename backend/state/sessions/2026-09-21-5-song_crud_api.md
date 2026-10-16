---
session_id: 5
feature: song_crud_api
agent: unknown
started_at: 2026-09-21T15:35:43.000Z
closed_at: 2026-09-21T15:41:51.000Z
---

## Plan
- Read docs/specs.md, architecture.md, conventions.md and precedent specs
- Read existing migrations/src (db/client, index, auth, storage, middleware) to ground the design
- Draft requirements.md in EARS
- Draft design.md with file-level plan and discarded alternatives
- Draft tasks.md with R<n>/T<n> traceability
- mark-spec-ready

## Log
- [unknown] Drafted specs/song_crud_api/{requirements.md,design.md,tasks.md}: 20 EARS requirements (R1-R20) covering POST/GET/GET:id/DELETE /songs, multipart preset+ir+nam+cover upload, extra_config/artist/pedal_preset_name handling, auth enforcement via protectedRouter, UUID-guarded 404s, and soft-delete-based DELETE. Design: new src/storage/index.ts (getStorage singleton), src/songs/song-service.ts (SongError, createSong/listSongs/getSongById/deleteSong with DI'd StorageAdapter as a test seam), src/songs/parse-multipart.ts, routes wired onto protectedRouter in index.ts. 19 tasks (T1-T19), all 20 R ids covered by at least one task; verified via script that all R1-R20 appear in tasks.md.

## Next Step

## Verification


## Closure

