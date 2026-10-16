-- 0004_multiple_presets_per_song.sql — a song now owns an ordered set of
-- 1..N presets, each named from its own .prst bytes. Supersedes the
-- "exactly one active preset per song" rule of 0001_init.sql/0003 (the
-- per-song unique index becomes a per-(song, sort_order) unique index) and
-- moves the preset name from songs.pedal_preset_name to
-- song_files.pedal_preset_name. No backfill: no stored production data.
-- Re-runnable: every statement is guarded with IF [NOT] EXISTS.

ALTER TABLE songs DROP COLUMN IF EXISTS pedal_preset_name;

ALTER TABLE song_files ADD COLUMN IF NOT EXISTS pedal_preset_name VARCHAR(255);

DROP INDEX IF EXISTS idx_song_files_one_preset_per_song;
CREATE UNIQUE INDEX IF NOT EXISTS idx_song_files_preset_sort_order
  ON song_files(song_id, sort_order) WHERE kind = 'preset' AND deleted_at IS NULL;

ALTER TABLE song_files DROP CONSTRAINT IF EXISTS song_files_pedal_preset_name_preset_only;
ALTER TABLE song_files ADD CONSTRAINT song_files_pedal_preset_name_preset_only
  CHECK (kind = 'preset' OR pedal_preset_name IS NULL);
