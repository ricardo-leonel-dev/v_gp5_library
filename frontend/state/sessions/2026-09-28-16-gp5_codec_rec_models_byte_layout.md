---
session_id: 16
feature: gp5_codec_rec_models_byte_layout
agent: Claude (implementer agent by MiniMax-M3[1m])
started_at: 2026-09-28T21:02:09.000Z
closed_at: 2026-09-28T21:30:27.000Z
---

## Plan
- Update codec header with F18 re-verification note (byte layout confirmed, vocab bug is F19)
- Add non-zero REC_MODELS test using captured preset 0 bytes
- Write progress/impl_gp5_codec_rec_models_byte_layout.md with analysis summary

## Log
- [Claude (implementer agent by MiniMax-M3[1m])] Captured real GP-5 bytes for preset 0 (10 blocks). Analysis: codec REC_MODELS byte layout (fxlow=bytes 0-2 LE, cat=byte 3) MATCHES valeton-gp50 reference. The FX title mismatch is NOT a codec bug — it's a VOCABULARY bug (feature 10's GP5_MODULE_FX_TITLES ordering doesn't match the GP-5's internal FX numbering). User confirmed: PRE/COMP at bytes [0,0,0,0] (vocab says NR/Gate, should say PRE/COMP); AMP/DarkTwin at bytes [4,0,0,7] (vocab says MOD/O-Phase, should say AMP/DarkTwin); CAB/UserIR at bytes [0,0,0x10,0xa] (vocab says invalid, should say CAB/UserIR). For at least AMP and CAB the GP-5's internal FX indexing differs from the manual's order. The vocabulary file's own header already flagged this as T17 (human-hardware follow-up, never executed). Closing F18's codec-bug hypothesis; creating F19 for vocabulary re-verification.
- [Claude (implementer agent by MiniMax-M3[1m])] feature 18 closeout: codec header documents vocab HYPOTHESIS status; non-zero REC_MODELS test added (186 → 187); impl summary written. ./init.sh green. Ready for reviewer approval.
- REVIEW (approved): F18 closeout: codec header documents 2026-09-28 real-hardware re-verification of REC_MODELS byte layout (matches valeton-gp50 reference). Regression test pins (cat, fxlow) interpretation against the four captured blocks. Codec byte interpretation UNCHANGED. FX title mismatch is a vocabulary bug (feature 10), owned by feature 19. 187/187 tests green.

## Next Step
- waiting on reviewer approval; F19 will be created to fix the actual vocab bug.

## Verification
187/187 tests green. Reviewer approved. Codec byte interpretation (fxlow=bytes 0-2 LE 24-bit, cat=byte 3) was independently re-verified against real GP-5 hardware on 2026-09-28 with a captured preset 0 dump — MATCHES valeton-gp50 reference. Regression test pins (cat, fxlow) interpretation against the four captured blocks; codec production code byte-identical to HEAD.

## Closure
F18 closes as 'no codec bug found'. The FX title mismatch Ricardo reported is owned by feature 10's GP5_MODULE_FX_TITLES — at least AMP and CAB have a different internal numbering on the real GP-5 vs the manual. The vocab file's own header flagged this as T17 (never executed). F19 (gp5_module_vocabulary_hardware_re_verification) will own the rebuild.
