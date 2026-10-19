-- 0009_pedal_image_mime_type.sql — MIME type of the stored reference image, served back as
-- Content-Type by GET /pedals/:id/image. Legacy rows keep NULL. Re-runnable.
ALTER TABLE pedal_catalog ADD COLUMN IF NOT EXISTS reference_image_mime_type TEXT;
