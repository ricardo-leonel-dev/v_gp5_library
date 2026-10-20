-- 0010_pedal_catalog_metadata.sql — brand, description, extras, is_editable on the shared catalog.
-- Rows that predate this file are Valeton GP-5 entries: brand backfilled to 'Valeton'. Re-runnable.
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS brand VARCHAR(255);
UPDATE pedal_catalog SET brand = 'Valeton' WHERE brand IS NULL;
ALTER TABLE pedal_catalog ALTER COLUMN brand SET NOT NULL;

ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS description VARCHAR(2000);

ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS extras JSONB;
UPDATE pedal_catalog SET extras = '{}'::jsonb WHERE extras IS NULL;
ALTER TABLE pedal_catalog ALTER COLUMN extras SET DEFAULT '{}'::jsonb;
ALTER TABLE pedal_catalog ALTER COLUMN extras SET NOT NULL;

ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS is_editable BOOLEAN;
UPDATE pedal_catalog SET is_editable = true WHERE is_editable IS NULL;
ALTER TABLE pedal_catalog ALTER COLUMN is_editable SET DEFAULT true;
ALTER TABLE pedal_catalog ALTER COLUMN is_editable SET NOT NULL;

ALTER TABLE pedal_catalog DROP CONSTRAINT IF EXISTS pedal_catalog_extras_is_object;
ALTER TABLE pedal_catalog ADD CONSTRAINT pedal_catalog_extras_is_object
  CHECK (jsonb_typeof(extras) = 'object');

CREATE INDEX IF NOT EXISTS idx_song_pedal_configs_pedal_catalog_id
  ON song_pedal_configs(pedal_catalog_id);

CREATE OR REPLACE FUNCTION pedal_is_attached(p_pedal_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM song_pedal_configs spc
    JOIN songs s ON s.id = spc.song_id
    WHERE spc.pedal_catalog_id = p_pedal_id
      AND spc.deleted_at IS NULL
      AND s.deleted_at IS NULL
  );
$$;