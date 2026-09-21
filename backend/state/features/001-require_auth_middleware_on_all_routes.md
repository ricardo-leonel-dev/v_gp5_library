---
feature_number: 1
name: require_auth_middleware_on_all_routes
title: Protect every song/pedal route with require-auth
status: done
created_at: 2026-09-21T04:17:31.000Z
updated_at: 2026-09-21T05:44:20.000Z
---

## Description
Every future song/pedal endpoint must go through requireAuth and scope its queries to c.get('userId'). This feature covers auditing/wiring that in as those routes land, plus a couple of negative tests proving a route can't be reached without a valid Bearer token or with another user's id smuggled in via the body/query.

## Acceptance
- [ ] A request to any protected route without an Authorization header returns 401
- [ ] A request with an expired or tampered JWT returns 401
- [ ] No route handler reads a user id from the request body/query to decide whose data to return — always from c.get('userId')
