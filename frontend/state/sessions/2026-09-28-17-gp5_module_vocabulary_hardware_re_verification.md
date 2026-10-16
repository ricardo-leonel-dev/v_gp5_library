---
session_id: 17
feature: gp5_module_vocabulary_hardware_re_verification
agent: unknown
started_at: 2026-09-28T21:36:51.000Z
closed_at: 2026-09-28T21:42:19.000Z
---

## Plan
- Read F19 description, F10 spec, F18 evidence, vocab/catalog/codec code
- Analyze captured preset-0 evidence vs vocab indexing model
- Draft requirements.md (EARS)
- Draft design.md with discarded alternatives + open questions
- Draft tasks.md with R traceability
- mark-spec-ready

## Log
- [unknown] Research done. Key finding: preset-0 evidence (cat0_fx0->PRE/COMP, cat7_fx4->AMP/Dark Twin, cata_fx100000->CAB/User IR) shows the cat byte is NOT the p.40 category index and fxlow is not a dense per-category index, so reordering GP5_MODULE_FX_TITLES[c][fxlow] in place (acceptance wording) cannot fix it. Designing an evidence-backed hardware-code lookup layered over the unchanged canonical manual tables (keeps GP5_FX_CATALOG + gp5Fx.c<c>.f<i> i18n keys stable).
- [unknown] requirements.md drafted: R1-R20 (capture fixture R1-R5, evidence-backed hardware code table R6-R8, decode/resolve rewiring R9-R15, status R16-R17, canonical-table stability R18-R20).
- [unknown] design.md + tasks.md drafted (T1-T18; T1 captures and T17 browser check are Ricardo-only). Open questions Q1-Q7 recorded in design.md, incl. coverage target, acceptance-wording deviation, and recommended depends_on on feature 16.

## Next Step

## Verification


## Closure

