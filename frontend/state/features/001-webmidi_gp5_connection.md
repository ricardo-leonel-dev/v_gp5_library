---
feature_number: 1
name: webmidi_gp5_connection
title: Implement PedalConnection.connect() over Web MIDI
status: pending
created_at: 2026-09-21T04:18:56.000Z
updated_at: 2026-09-21T04:19:25.000Z
---

## Description
navigator.requestMIDIAccess({sysex:true}) device pairing and a connection-state UI. Only proceed when WebMidiPedalConnection.isSupported() is true — this feature is Chrome/Edge/Opera/Firefox 108+ only, never Safari/iOS (see unsupported_browser_fallback_ui).

## Acceptance
- [ ] connect() requests MIDI access with sysex:true and resolves once the GP-5 is found among the available devices
- [ ] A connection-state signal/UI distinguishes 'not connected', 'connecting', 'connected', and 'error' states
- [ ] Manually verified against a real GP-5 over USB in Chrome or Firefox (can't be automated without hardware)
