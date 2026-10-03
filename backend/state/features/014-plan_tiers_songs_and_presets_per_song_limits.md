---
feature_number: 14
name: plan_tiers_songs_and_presets_per_song_limits
title: Plan tiers: songs and presets-per-song limits
status: in_progress
created_at: 2026-10-02T21:05:47.000Z
updated_at: 2026-10-03T21:06:00.000Z
---

## Description
Replace the current free-plan limit (10 songs) with per-tier limits on both live songs and presets per song: free = max 1 song with max 1 preset; basic (paid) = max 2 songs, each max 2 presets; premium (paid) = unlimited songs and presets. Expose the caller's plan and limits so the frontend can warn before submitting. Related to card multiple_presets_per_song_with_per_preset_reference_metadata (presets per song).

## Acceptance
- [ ] 1) Plans free/basic/premium exist with limits: free songs<=1 presets/song<=1; basic songs<=2 presets/song<=2; premium unlimited. 2) POST /songs returns 402 with a distinct, stable machine-readable code per limit (e.g. {error, code: 'plan_song_limit' | 'plan_preset_limit', plan, limit}) when exceeded; nothing is persisted. 3) A read endpoint (e.g. GET /me or GET /me/plan) returns the caller's plan and both limits (null = unlimited) plus current song count. 4) Soft-deleted songs do not count. 5) Existing users/songs migrate without data loss; songs already above a new limit stay readable (limits apply only to new writes). 6) Tests cover each tier boundary.
