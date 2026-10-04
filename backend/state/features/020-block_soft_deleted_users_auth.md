---
feature_number: 20
name: block_soft_deleted_users_auth
title: Block soft-deleted users from login and API access
status: done
created_at: 2026-10-04T03:12:39.000Z
updated_at: 2026-10-04T05:21:58.000Z
---

## Description
Today login does not filter users.deleted_at, and requireAuth trusts any valid JWT without checking the user still exists/is live, so a soft-deleted user can log in and keep using the API until the token expires. Found during the feature 18 spec (D14).

## Acceptance
- [ ] 1) POST /auth/login for a soft-deleted user returns 401 with the same body as wrong credentials (no account enumeration). 2) A valid JWT whose user is soft-deleted or no longer exists is rejected with 401 on every protected route (decide in spec how: per-request DB check vs. alternative, and its cost). 3) GET /auth/me for such a token returns 401. 4) Register behavior for a soft-deleted email is unchanged (still 409). 5) Tests cover login, a protected route and /auth/me for soft-deleted and missing users.
