---
feature_number: 16
name: gp5_preset_chain_visual_board_review_fixes
title: Fix review findings on the GP-5 chain visual board (feature 14)
status: in_progress
created_at: 2026-09-28T19:16:52.000Z
updated_at: 2026-09-29T05:22:15.000Z
---

## Description
An independent re-review of feature 14 found that it deviates from its approved spec (specs/gp5_preset_chain_visual_board/) in several places: an untranslated hypothesis notice (R30), no close button in the detail panel, re-selecting the same preset leaves the detail open (R25), and T37 and T41 are ticked without the work being done. Some tests can never fail and the board side has no tests. Full findings: progress/review2_gp5_preset_chain_visual_board.md (M1-M7, m1-m6, N1, N4, N5). T41 (feature 14's manual visual check) is a HARD GATE: it will be done later together with the user; the implementer must NOT run log-out until the user confirms T41 is done. Once the code items are finished and reviewed, leave the session open (append-log + set-next-step 'waiting on T41 manual check with the user') instead of logging out.

## Acceptance
- [ ] R30: detail shows translated chainBoard.mapping_hypothesis for resolved AND unknown blocks; test asserts the translated text
- [ ] Detail panel has a chainBoard.close button that closes it; tested
- [ ] Re-selecting the already-selected preset closes the detail (R25); tested
- [ ] T37: MIDIOutput.send spy test via real WebMidiPedalConnection walks blocks, browse toggle and close with no extra send
- [ ] T41 (HARD GATE before log-out): manual visual check at 375px and >=1024px, light/dark, done together with the user and recorded; do NOT log out until the user confirms it; 640px sm breakpoint claim corrected
- [ ] R13/R14 tests call categoryStyle(0..9); chain-board.spec covers R16-R19 (style, dimming, unknown blocks)
- [ ] Board/strip aria-labels translated incl. on/off; board unknown block uses chainBoard.unknown_short and has no LED
- [ ] No $any in templates; empty ngAfterViewInit removed; order tests assert content; no <p> inside <button>
- [ ] Unrelated fixtures/comments restored in preset-browser-page.spec.ts; trailing newlines restored
- [ ] ./init.sh green

## Notes
- 2026-09-29T05:02:13.000Z [leader] T41 CONFIRMED by user (Ricardo) on 2026-09-29: manual visual check done at 375px and >=1024px, light and dark, all OK. Gate on F17 dropped by user decision (F17 gets its own visual check; AMP title mismatch is owned by F19). Unblocked. Cannot log out yet: session 15 (review approved) was soft-deleted with cancel-session --force on 2026-09-28 to free the slot for F18, so F16 is in_progress with no session and neither claim (pending only) nor reopen (done only) can open one. Harness gap.
