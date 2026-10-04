---
feature_number: 18
name: email_lowercase_normalization
title: Normalize user emails to lowercase
status: done
created_at: 2026-10-03T22:20:03.000Z
updated_at: 2026-10-04T04:08:16.000Z
---

## Description
Emails are stored and compared in lowercase so Foo@x.com and foo@x.com are the same account. Today register/login use the raw email (dev DB: 4260 mixed-case rows, 0 case collisions).

## Acceptance
- [ ] 1) register/login trim + lowercase the email before any query. 2) Migration lowercases existing users.email and aborts with a clear error if two rows collide case-insensitively. 3) Unique index on lower(email) so it cannot regress. 4) GET /admin/users?email= and the set-role script match case-insensitively. 5) Tests: Foo@X.com registers, foo@x.com logs in; duplicate differing only by case -> 409.
