-- 0001_init.sql — initial schema stub. Finalized once real GP-5 preset/IR/NAM
-- dumps are in hand (see docs/architecture.md and the songs_schema_migrations
-- feature in harness.db).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan          VARCHAR(50) NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per saved song/preset bundle. Always owned by exactly one user —
-- nothing here is ever shared between accounts.
CREATE TABLE IF NOT EXISTS songs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  artist            VARCHAR(255),
  pedal_preset_name VARCHAR(255),
  extra_config      JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_songs_user_id ON songs(user_id);

-- One row per physical file attached to a song. kind='preset' is required
-- (exactly one per song); 'ir'/'nam'/'cover' are 0..N — the GP-5 supports up
-- to 20 user IR files and 80 SnapTone/NAM captures, so a song's preset chain
-- can reference several of each.
CREATE TABLE IF NOT EXISTS song_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id           UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  kind              VARCHAR(20) NOT NULL CHECK (kind IN ('preset', 'ir', 'nam', 'cover')),
  storage_key       TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  byte_size         INTEGER NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_song_files_song_id ON song_files(song_id);

-- Shared, in-app pedal reference catalog — visible to every logged-in user,
-- not tied to one account.
CREATE TABLE IF NOT EXISTS pedal_catalog (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(255) NOT NULL,
  reference_image_key TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A user's private configuration of a shared pedal_catalog entry, for one
-- specific song. Private to user+song even though pedal_catalog_id points at
-- a shared entry.
CREATE TABLE IF NOT EXISTS song_pedal_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id          UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pedal_catalog_id UUID NOT NULL REFERENCES pedal_catalog(id) ON DELETE RESTRICT,
  label            VARCHAR(255) NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_song_pedal_configs_song_id ON song_pedal_configs(song_id);
CREATE INDEX IF NOT EXISTS idx_song_pedal_configs_user_id ON song_pedal_configs(user_id);
