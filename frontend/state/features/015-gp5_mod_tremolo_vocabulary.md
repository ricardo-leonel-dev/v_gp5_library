---
feature_number: 15
name: gp5_mod_tremolo_vocabulary
title: Add MOD tremolos (O-Trem, Sine Trem, Bias Trem) to GP-5 vocabulary after hardware check
status: pending
created_at: 2026-09-28T17:51:47.000Z
updated_at: 2026-09-28T17:51:58.000Z
---

## Description
Feature 10 kept MOD at 8 FX and feature 14's catalog follows it, so O-Trem, Sine Trem and Bias Trem (manual p.33) currently render as unknown blocks. First confirm on the real GP-5 which fxlow value each tremolo uses (expected 8-10), then extend the vocabulary and catalog accordingly.

## Acceptance
- [ ] The fxlow value of each MOD tremolo is confirmed on the real GP-5 and recorded
- [ ] GP5_MODULE_FX_TITLES[7] has 11 entries including O-Trem, Sine Trem and Bias Trem, with feature 10's tests updated
- [ ] GP5_FX_CATALOG MOD entries include the 3 tremolos with parameter names from manual p.33 and es/en descriptions
- [ ] The chain board and FX browser show the tremolos instead of the unknown-module block
