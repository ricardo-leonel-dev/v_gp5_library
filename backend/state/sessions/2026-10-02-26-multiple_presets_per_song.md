---
session_id: 26
feature: multiple_presets_per_song
agent: leader -> spec_author (claude-opus-5-5)
started_at: 2026-10-02T21:14:18.000Z
closed_at: 2026-10-02T21:17:58.000Z
---

## Plan
- Read docs + current song code/migrations/specs
- Write requirements.md (EARS)
- Write design.md (migration 0004, DTO, parsing, back-compat, open questions)
- Write tasks.md mapped to R ids
- mark-spec-ready

## Log
- [leader -> spec_author (claude-opus-5-5)] Studied song-service.ts, parse-multipart.ts, migrations 0001-0003, migrate.test.ts, specs of features 2/3/4/7/9. Key findings: unique index idx_song_files_one_preset_per_song blocks N presets; form field pedal_preset_name currently song-level and collides with new repeatable per-preset field; GET /songs list returns no files today; getSongFile already defaults sort_order to 0 and 404s out-of-range.
- [leader -> spec_author (claude-opus-5-5)] Drafted specs/multiple_presets_per_song/{requirements,design,tasks}.md: 30 EARS reqs, 17 tasks; migration 0004 adds song_files.pedal_preset_name + backfill, swaps preset unique index to (song_id, sort_order); 8 open questions in design.md.

## Next Step

## Verification


## Closure

