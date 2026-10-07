---
feature_number: 29
name: pedal_page_sync_feedback_and_list
title: /pedal page: sync feedback, scrollable preset list, mock presets link
status: pending
created_at: 2026-10-07T06:15:17.000Z
updated_at: 2026-10-07T06:15:20.000Z
---

## Description
After reading presets from the GP-5 on /pedal there is no visible confirmation that the sync finished; the 'Explore presets' list overflows the viewport so the first and last presets can't be reached; the 'Cargar presets de prueba' link in the header does nothing.

## Acceptance
- [ ] A visible success state (with preset count) appears after a read completes, and an error state if it fails
- [ ] The preset list fits the viewport with its own scroll at 375px and 1280px, so preset 0 and preset 99 are both reachable
- [ ] 'Cargar presets de prueba' loads the mock presets and shows them, or is removed if F26 replaces it
