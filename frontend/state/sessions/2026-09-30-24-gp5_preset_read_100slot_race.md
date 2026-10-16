---
session_id: 24
feature: gp5_preset_read_100slot_race
agent: leader -> implementer (Claude Opus 5.5)
started_at: 2026-09-30T17:58:16.000Z
closed_at: 2026-09-30T20:51:10.000Z
---

## Plan
- Step A: remove stale slot-byte wording in specs and trim F20/F22/F23 history comments (no behavior change)
- Step B1: replace encodeProgramChange with encodeSelectPreset (CC0 [0xb0,0x00,slot])
- Step B2: pre-read active preset body, match slots by raw body in codec, restore via CC0 or expose restoreWarning signal
- Step B3: filter unsolicited 0x1b patch-change notification frames in the codec body phase
- Step B4: page shows non-blocking restore warning (es/en i18n)
- Step B5: tests (CC0 regression, restore unique/none/multiple, notification filter, real-codec e2e with captured bodies)
- Verify with direnv exec . ./init.sh and write progress/impl_gp5_preset_read_100slot_race.md

## Log
- [leader -> implementer (Claude Opus 5.5)] Step A done: stale slot-byte wording removed from connection/page specs, F20/F22/F23 narrative trimmed in codec header, buildRequest/encodeReadAllRequest comments and readPresets comments; also dropped personal names from codec header/spec comments. 794/794 green. Diff saved to progress/f24_stepA_cleanup.patch
- [leader -> implementer (Claude Opus 5.5)] Step B done: CC0 [0xb0,0x00,slot] replaces PC (encodeProgramChange -> encodeSelectPreset); pre-read active body via encodeActivePresetRequest (decodes as kind 'activePreset', does not advance currentSlot); codec compares raw bodies -> slotsMatchingActivePreset(); readPresets restores on exactly one match, else sets restoreWarning signal ('restore_no_match'|'restore_ambiguous'); page shows amber role=status notice (es/en). Body-phase index-0 chunks without [0x12,0x41] echo are ignored (drops 0x1b patch-change notification). Waiters unified into waitForStep. Fixed pre-existing codec-spec buildNamesBlob DataView offset bug (idx written 2 bytes late; only slot 0 names were ever asserted). 811/811 green, ng build ok. Patches: progress/f24_stepA_cleanup.patch, progress/f24_stepB_fix.patch (B relative to A).
- [leader] HARDWARE VERIFIED by Ricardo (2026-09-30), production app on real GP-5: (A) full catalog reads; every preset he selected shows exactly the same chain as Valeton's own app (User IR naming still pending, out of scope — tracked separately); (B) the pedal visibly switches presets during the read and, at the end, returns to the preset that was active before the read (restore unique-match path works on hardware; unselected vs CC0-selected bodies are byte-stable).

## Next Step

## Verification
direnv exec . ./init.sh green: 17 files, 811/811 tests (was 794), ng build OK; only WARN is pre-existing Supabase PGRST125 sync. Reviewer approved (progress/review.md) incl. mutation check confirming the CC0/notification/restore regression tests fail on reverted behavior. Hardware (Ricardo): A) every preset read in the app matches Valeton's app; B) the pedal returns to its pre-read preset after the full read.

## Closure
Root cause: the GP-5 ignores MIDI Program Change [0xc0, slot]; CC0 [0xb0,0x00,slot] (manual p.40) selects the patch. readPresets now selects each slot with CC0 (300ms settle, buildRequest(BODY_SEL) unchanged), filters the unsolicited 0x1b patch-change notification (body-phase index-0 chunk without [0x12,0x41] echo is ignored), pre-reads the active preset body and restores it via CC0 when exactly one slot's raw body is byte-identical, else exposes restoreWarning (restore_no_match/restore_ambiguous) shown as a non-blocking notice. Commits 426cd34 (step A cleanup) + f6c8e3a (step B fix) on feature/gp5-preset-read-cc0-select.
