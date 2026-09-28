---
feature_number: 10
name: gp5_module_vocabulary_decoding
title: Decode GP-5 effect module vocabulary (cat/fx codes -> real names)
status: done
created_at: 2026-09-27T21:46:32.000Z
updated_at: 2026-09-28T14:13:42.000Z
---

## Description
PresetSlot.moduleType today is an opaque 'cat{N}_fx{M}' string because sysex_preset_read_write's design left the GP-5's real module vocabulary as an unconfirmed open question. external_docs/gp-5-manual.pdf (added 2026-09-27) documents a MIDI CC table (p.40) assigning module categories NR=48,PRE=49,DST=50,N->S=51,AMP=52,CAB=53,EQ=54,MOD=55,DLY=56,RVB=57 in strict sequential order, plus a full Effect List (p.20-37) naming every FX Title within each category (e.g. PRE contains COMP, COMP4, Boost, Micro Boost, B-Boost, Toucher, Crier, OCTA, Pitch, Detune...). This strongly suggests cat=0..9 maps to that same NR..RVB sequence and fxlow indexes the FX Title within it. This feature builds and verifies a lookup table decoding (cat, fxlow) into a human-readable {category, fxTitle} pair, to be consumed by preset-displaying UI (preset_browser_ui and later features). The mapping is a hypothesis derived from the manual and MUST be verified against Ricardo's real GP-5 hardware (e.g. by reading a known factory patch and comparing decoded names to what the pedal's own screen shows) before being trusted as ground truth.

## Acceptance
- [ ] A documented, tested cat->category and (cat,fxlow)->FX-title lookup derived from external_docs/gp-5-manual.pdf, cited by page number.
- [ ] At least one round-trip verification against real GP-5 hardware confirming the mapping is correct for a sample of real patches (not just internal consistency).
- [ ] moduleType (or a new decoded field alongside it) exposes the resolved category/FX name, falling back gracefully to the raw cat/fx code when a code isn't in the manual's table.
- [ ] No change to the raw SysEx encode/decode byte layout itself - this is a display/lookup layer on top of the existing codec, not a protocol change.
