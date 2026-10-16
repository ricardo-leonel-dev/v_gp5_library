-- 0006_user_roles_and_plan_changes.sql — adds users.role ('user' | 'admin') and
-- the plan_changes audit log.
-- Existing users become 'user' via the column default.
-- plan_changes is an append-only audit log, so it has no updated_at/deleted_at
-- (a documented exception to the soft-delete convention).
-- changed_by is a users.id for an admin change and NULL for a non-human actor
-- (e.g. billing webhooks).
-- FK actions: user_id ON DELETE CASCADE (erasing a user drops their own audit
-- trail), changed_by ON DELETE SET NULL (rows they authored as an admin stay).
-- old_plan/new_plan have no CHECK on purpose: an audit row must survive a later
-- change to the tier list.
-- Re-runnable: Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the constraint
-- is dropped (if present) and re-added.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_valid;
ALTER TABLE users ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin'));

CREATE TABLE IF NOT EXISTS plan_changes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_plan   VARCHAR(50) NOT NULL,
  new_plan   VARCHAR(50) NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_changes_user_id_created_at
  ON plan_changes(user_id, created_at);
