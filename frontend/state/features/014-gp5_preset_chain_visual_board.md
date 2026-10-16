---
feature_number: 14
name: gp5_preset_chain_visual_board
title: Visual effect-chain board for GP-5 presets with clickable block detail
status: done
created_at: 2026-09-28T17:34:25.000Z
updated_at: 2026-09-28T18:53:57.000Z
---

## Description
The preset browser currently shows each preset's chain as raw 'cat{N}_fx{M}' codes, which is unreadable. Render the chain graphically, Valeton-app style: a compact strip of the 10 blocks (NR, PRE, DST, N->S, AMP, CAB, EQ, MOD, DLY, RVB) per preset row in the preset's real chain order, colored by category, enabled blocks lit and bypassed blocks dimmed; and, for the selected preset, a larger clickable block grid. Clicking a block opens its detail: category, active FX title (via describeModuleType from feature 10), on/off state, and its parameter values labelled with the manual's parameter names (external_docs/gp-5-manual.pdf pp.20-37). From a block's detail the user can also browse every FX available in that category with its manual description and parameter list, the active one marked. Strictly read-only: nothing is written to the pedal. The p0..p7 -> parameter-name/scale mapping is a manual-derived HYPOTHESIS (same status convention as feature 10) until verified against real hardware.

## Acceptance
- [ ] Each preset row shows a compact strip of its chain blocks in real chain order, colored by category, enabled lit / bypassed dimmed; raw cat/fx codes are no longer shown to the user
- [ ] Selecting a preset shows a larger block grid where every block is clickable and opens a detail panel with category, active FX title, on/off state and parameter values
- [ ] Parameter values are labelled with the manual's per-FX parameter names where known (cited by page), falling back to raw p0..p7 values when unknown; mapping status documented as HYPOTHESIS
- [ ] From a block's detail the user can browse every FX of that category with its manual description and parameters, with the preset's active FX marked
- [ ] Modules that can't be decoded render a neutral fallback block without breaking the layout
- [ ] Read-only: no MIDI write is triggered by any interaction on this screen
- [ ] Works at 375px and desktop widths, in light and dark mode, with all user-facing strings in public/i18n (es/en)
