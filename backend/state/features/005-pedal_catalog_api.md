---
feature_number: 5
name: pedal_catalog_api
title: GET/POST /pedals — shared reference catalog
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T08:33:47.000Z
---

## Description
A shared, in-app catalog of external pedal models (name + reference image), visible to every logged-in user regardless of who added it.

## Acceptance
- [ ] POST /pedals (authenticated) creates a catalog entry with an uploaded reference image, recording created_by
- [ ] GET /pedals (authenticated) lists every catalog entry regardless of who created it
