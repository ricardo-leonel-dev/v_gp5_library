---
feature_number: 11
name: preset_browser_ui_followup_fixes
title: Fix dead i18n key + undocumented angular.json change
status: done
created_at: 2026-09-28T05:44:14.000Z
updated_at: 2026-09-28T06:18:24.000Z
---

## Description
Follow-up fixes found during independent review of feature 3 (preset_browser_ui): (1) presetBrowser.not_connected_error i18n key is unused/dead - the actual not_connected rejection resolves to presetBrowser.not_connected instead; wire it correctly or remove the dead key, with a test covering the not_connected rejection path. (2) angular.json gained cli.analytics:false undocumented in design.md/session log - confirm intentional or revert.

## Acceptance
- [ ] not_connected rejection path is covered by a test and resolves to the correct/intended i18n key
- [ ] no orphaned i18n keys remain in en.json/es.json for this component
- [ ] angular.json change is either documented as intentional or reverted
