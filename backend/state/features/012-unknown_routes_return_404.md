---
feature_number: 12
name: unknown_routes_return_404
title: Return 404 for unknown routes instead of 401
status: done
created_at: 2026-09-26T07:10:44.000Z
updated_at: 2026-09-30T21:42:50.000Z
---

## Description
protectedRouter is mounted at '/', so requireAuth intercepts every path and unknown routes respond 401 instead of 404.

## Acceptance
- [ ] Unknown routes respond 404 with a JSON body, with or without a token
- [ ] Protected routes without a token still respond 401
- [ ] Feature 1 and 11 tests keep passing
