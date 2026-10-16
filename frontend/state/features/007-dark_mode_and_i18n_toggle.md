---
feature_number: 7
name: dark_mode_and_i18n_toggle
title: Polish dark mode + es/en toggle across every screen
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-22T08:01:26.000Z
---

## Description
DarkModeService and the Transloco setup already exist from the scaffold — this feature is about auditing every screen built since then for correct dark: classes and complete translation keys, not building the mechanism itself.

## Acceptance
- [ ] No screen has unstyled/wrong-contrast elements in dark mode
- [ ] No hardcoded user-facing string exists outside public/i18n/*.json
