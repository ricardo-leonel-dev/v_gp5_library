---
feature_number: 19
name: auth_plan_code_cleanups
title: Auth/plan code cleanups
status: done
created_at: 2026-10-03T22:20:03.000Z
updated_at: 2026-10-03T22:21:52.000Z
---

## Description
Small no-behavior-change cleanups flagged by the feature 16 review.

## Acceptance
- [ ] 1) plan-service imports UserRow from user-service (single declaration). 2) src/index.test.ts strict-null fix in the plan_changes count (const [row]; row!.c) so tsc reports no new error there. 3) No behavior change; bun test green.
