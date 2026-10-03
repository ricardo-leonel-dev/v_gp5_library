---
feature_number: 16
name: plan_management_admin
title: Plan management: admin role and plan change endpoint
status: done
created_at: 2026-10-03T21:05:52.000Z
updated_at: 2026-10-03T21:56:08.000Z
---

## Description
Add users.role ('user'|'admin', default 'user', CHECK constraint), always read from DB per request, never from the JWT. A requireAdmin middleware on the protected router guards /admin/*. One service setUserPlan(userId, plan, changedBy) is the single write path for plans (reused later by billing). Admin-only PATCH /admin/users/:id/plan {plan}. No API grants the admin role; it is granted only via SQL/script.

## Acceptance
- [ ] 1) Migration adds users.role (default 'user', CHECK user|admin); documented way to bootstrap the first admin (SQL/script). 2) PATCH /admin/users/:id/plan returns 200 with the updated user; 400 invalid plan; 403 non-admin; 404 unknown user. 3) Role and plan are read from DB, so a change applies immediately to limits and GET /me/plan without re-login, and revoking admin takes effect on the next request. 4) Every plan change writes a plan_changes audit row (user_id, old_plan, new_plan, changed_by, created_at). 5) No endpoint can grant or change roles. 6) Tests cover every status code and the audit row.
