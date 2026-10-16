---
session_id: 14
feature: song_metadata_and_extra_config
agent: unknown
started_at: 2026-09-21T21:20:39.000Z
closed_at: 2026-09-21T21:24:22.000Z
---

## Plan
- Read docs (specs.md, architecture.md, conventions.md) and sibling specs (song_pedal_configs_api, pedal_catalog_api)
- Explore songs schema/service/routes to pin down exact scope from feature 7's stored description+acceptance and song_crud_api's scope note
- Draft requirements.md in EARS covering name-required (R1), extra_config round-trip (R2), size cap definition+enforcement (R3/R4), boundary case (R5)
- Draft design.md: files to touch (song-service.ts only, no migration, no new route), size-cap implementation approach, discarded alternatives
- Draft tasks.md with T1-T7 mapped to R1-R5
- mark-spec-ready and report

## Log
- [unknown] Read AGENTS.md/docs/specs.md/architecture.md/conventions.md, sibling specs song_pedal_configs_api and pedal_catalog_api, and current schema/code (0001_init.sql, song-service.ts, parse-multipart.ts, index.ts). Confirmed via song_crud_api's own requirements.md scope note and feature 7's stored description/acceptance in state/features/007-*.md that this feature's scope is: name-required (already implemented, reaffirm), extra_config JSON round-trip fidelity, and a new size cap (32KB) on extra_config -- all layered into the existing POST /songs; no new route, no new migration, no PATCH/update route (none exists yet, out of scope).
- [unknown] Drafted requirements.md (R1-R5: name-required reaffirmed, extra_config round-trip fidelity, 32KB size cap definition+enforcement, boundary case), design.md (no schema/route change, size check added to createSong in song-service.ts before JSON.parse, 4 discarded alternatives), tasks.md (T1-T8). Verified every R<n> is covered by at least one task.

## Next Step

## Verification


## Closure

