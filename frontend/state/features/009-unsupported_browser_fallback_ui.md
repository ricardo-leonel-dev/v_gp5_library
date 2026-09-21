---
feature_number: 9
name: unsupported_browser_fallback_ui
title: Explicit unsupported-browser state (Safari/iOS)
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-21T04:19:34.000Z
---

## Description
When PedalConnection.isSupported() is false, show a clear message instead of failing silently or letting the user hit a confusing error deep in a MIDI call. The rest of the app (browsing/managing already-saved songs) still works there — only live pedal connection is gated.

## Acceptance
- [ ] Visiting any pedal-connection screen on a browser without Web MIDI shows an explicit 'not supported, use Chrome/Edge/Firefox' message
- [ ] Manually verified in Safari: the message shows and the rest of the app (songs list, etc.) still functions
