---
feature_number: 2
name: songs_schema_migrations
title: Finalize the songs/song_files schema against real GP-5 dumps
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T04:19:11.000Z
---

## Description
0001_init.sql is a stub. Once real preset/IR/NAM dumps from the pedal are available, confirm the actual multiplicity of IR/NAM files per song and adjust song_files/indices if needed (e.g. ordering within a preset's signal chain).

## Acceptance
- [ ] A migration (0002_*) exists if the stub schema needed changes, or a note in docs/architecture.md confirms the stub already matches reality
- [ ] bun run migrate applies cleanly against a fresh docker-compose Postgres
