---
feature_number: 10
name: stage_aware_provider_config
title: Stage-aware DB & storage provider configuration
status: done
created_at: 2026-09-22T06:01:48.000Z
updated_at: 2026-09-22T06:29:12.000Z
---

## Description
Introduce a per-deployment-stage configuration mechanism (a config file, not scattered ad-hoc env var checks) that selects, for each deployment stage (dev, staging, main/production), which Postgres provider to use and which storage provider to use. dev must default to a local Postgres instance. staging/main must be configurable per stage -- e.g. another Postgres instance via Docker, or hosted Supabase Postgres -- decided at deploy time via the config file, not hardcoded. Storage stays on the existing LocalFsStorageAdapter for every stage in this feature (no SupabaseStorageAdapter or any other non-local storage adapter is implemented here) -- but the per-stage resolution mechanism must be built so that a future feature can wire in a different storage provider per stage (e.g. cloud storage for staging/main) without redesigning this mechanism, the same way DB provider resolution works. Also evaluate and document the auth approach (keep the current JWT approach vs moving to Supabase Auth) given Supabase Postgres is one of the possible staging/main DB options -- either choice is acceptable, document the reasoning.

## Acceptance
- [ ] docs/architecture.md documents the config file format and exactly how each stage (dev/staging/main) resolves its DB provider and storage provider from it, including the exact env vars / steps for pointing a stage at hosted Supabase Postgres as one of the staging/main options
- [ ] A config-driven resolution mechanism selects the Postgres connection per active stage, defaulting dev to a local Postgres instance, without any code change needed to add a new stage's DB provider later
- [ ] Storage resolves to LocalFsStorageAdapter for every stage as of this feature, via the same per-stage resolution mechanism used for DB provider selection (not a separate ad-hoc switch), so a future feature can add another storage provider per stage without redesigning the mechanism
- [ ] The JWT-vs-Supabase-Auth decision is evaluated and documented in docs/architecture.md with rationale
