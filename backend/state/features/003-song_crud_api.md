---
feature_number: 3
name: song_crud_api
title: POST/GET/GET:id/DELETE /songs scoped to the authenticated user
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T08:33:46.000Z
---

## Description
Multipart upload for the preset file plus optional IR/NAM/cover files, backed by Postgres (songs + song_files tables) and LocalFsStorageAdapter. Every operation scoped to the authenticated user's own songs only.

## Acceptance
- [ ] POST /songs with a multipart body (preset file + metadata) creates a song and its song_files rows, storing bytes via StorageAdapter
- [ ] GET /songs lists only the authenticated user's own songs, never another user's
- [ ] GET /songs/:id 404s (not 403) for a song owned by a different user, to avoid leaking existence
- [ ] DELETE /songs/:id removes the DB rows and the underlying files
