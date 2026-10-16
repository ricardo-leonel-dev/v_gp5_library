-- 0003_song_files_ordering.sql — adds explicit signal-chain ordering for
-- ir/nam song_files (flagged as an open question in 0001_init.sql), and
-- enforces the "exactly one active preset row per song" invariant that
-- 0001_init.sql's own comment already documented but never constrained.
-- Depends on 0002_audit_columns.sql having already added deleted_at.

ALTER TABLE song_files ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_song_files_one_preset_per_song
  ON song_files(song_id) WHERE kind = 'preset' AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_song_files_song_id;
CREATE INDEX IF NOT EXISTS idx_song_files_song_id_kind_sort_order
  ON song_files(song_id, kind, sort_order);
