-- 0008_pedal_parameters.sql — typed parameter definitions per catalog pedal.
-- Existing rows read '[]' (legacy pedal: free-form config). Re-runnable.
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '[]'::jsonb;