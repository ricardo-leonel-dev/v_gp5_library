-- 0002_audit_columns.sql — adds updated_at to the three tables that were
-- missing it, and deleted_at (soft-delete marker) to all five tables. Must
-- run before 0003_song_files_ordering.sql, whose unique partial index
-- predicate references song_files.deleted_at.

ALTER TABLE song_files         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pedal_catalog      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE song_pedal_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE songs              ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE song_files         ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE pedal_catalog      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE song_pedal_configs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
