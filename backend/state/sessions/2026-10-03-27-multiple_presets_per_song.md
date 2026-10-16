---
session_id: 27
feature: multiple_presets_per_song
agent: leader -> spec_author (claude-opus-5-5)
started_at: 2026-10-03T03:09:40.000Z
closed_at: 2026-10-03T03:13:06.000Z
---

## Plan
- Verify .prst name offsets with xxd on the 3 samples
- Re-read current song code/tests to map what the new criteria invalidate
- Rewrite requirements.md against new acceptance
- Rewrite design.md (migration, parser, DTOs, superseded list)
- Rewrite tasks.md with R coverage
- mark-spec-ready

## Log
- [leader -> spec_author (claude-opus-5-5)] Verified with xxd: all 3 samples 507 bytes, magic 'GP-5' at 0..3, NUL-padded ASCII name at 0x19..0x28, 0x29=0xFF. Existing tests use fake preset bytes, so success-path tests must switch to real fixtures.
- [leader -> spec_author (claude-opus-5-5)] Rewrote requirements (R1-R30), design, tasks (T1-T18) against new acceptance: name parsed from .prst bytes, song-level column dropped, presets only in presets[], pedal_preset_name field ignored.

## Next Step

## Verification


## Closure

