---
feature_number: 9
name: plan_limits_enforcement
title: Enforce a per-plan cap on stored songs
status: done
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-22T07:12:36.000Z
---

## Description
Low priority — once subscriptions/plans are a real product decision, enforce a max song count per users.plan (e.g. free=10, paid=unlimited). Not needed until a plan/billing feature exists.

## Acceptance
- [ ] Creating a song beyond the caller's plan limit returns 402 or 403 with a clear error message
- [ ] The limit per plan is defined in one place, not scattered across route handlers
