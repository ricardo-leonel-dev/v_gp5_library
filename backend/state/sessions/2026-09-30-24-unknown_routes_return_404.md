---
session_id: 24
feature: unknown_routes_return_404
agent: leader -> spec_author (claude-opus-5-5)
started_at: 2026-09-30T21:17:19.000Z
closed_at: 2026-09-30T21:20:52.000Z
---

## Plan
- Rework terminology: known path vs unknown path vs method mismatch
- Rewrite requirements R1-R19 per human decisions Q1-Q5
- Redesign mechanism: app-level unknown-route guard built from app.routes (method-independent path index)
- Move Q1-Q5 into Decisions, add new open questions
- Rewrite tasks with traceability + optional hono pin task
- mark-spec-ready

## Log
- [leader -> spec_author (claude-opus-5-5)] SPEC REVISION: re-opened a spec_ready spec for revision (was R=14, T=17)
- [leader -> spec_author (claude-opus-5-5)] Prototyped app-level guard in scratchpad against hono 4.13.8: path index = SmartRouter(RegExp+Trie) fed non-ALL app.routes under METHOD_NAME_ALL; PUT /songs no token->401, with token->404 JSON, /nope->404, /songs/->404, /songs/abc->401, HEAD->401, OPTIONS /nope->204, ACAO on 404 present
- [leader -> spec_author (claude-opus-5-5)] Revised spec per human review: Q1 changed (method mismatch -> auth runs, 401/404 not 405), new app-level unknown-route guard over app.routes, Decisions D1-D5, new open Q-A (app.all handlers), optional T19 hono pin; R=19 T=19

## Next Step

## Verification


## Closure

