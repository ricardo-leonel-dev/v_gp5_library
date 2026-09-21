---
feature_number: 8
name: supabase_migration_path
title: Swap local Postgres + LocalFsStorageAdapter for Supabase
status: pending
created_at: 2026-09-21T04:17:32.000Z
updated_at: 2026-09-21T08:33:47.000Z
---

## Description
Document and implement the cutover: DATABASE_URL pointed at hosted Supabase Postgres, a SupabaseStorageAdapter implementing the same StorageAdapter interface for Supabase Storage, and an evaluation of moving auth to Supabase Auth at the same time (or keeping the current JWT approach against Supabase Postgres — either is acceptable, document the choice).

## Acceptance
- [ ] docs/architecture.md documents the exact env vars / steps to point this backend at a real Supabase project
- [ ] SupabaseStorageAdapter exists and passes the same put/get/delete contract test as LocalFsStorageAdapter (extract a shared test suite over the StorageAdapter interface if useful)
