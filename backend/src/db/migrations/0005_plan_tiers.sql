-- 0005_plan_tiers.sql — users.plan becomes one of three tiers: free, basic,
-- premium. Legacy non-tier values (only 'paid' from feature-9 tests is known)
-- were unlimited under the old rule, so they map to 'premium', which keeps
-- them unlimited. Column type and the 'free' default are unchanged. No
-- songs/song_files row is touched: limits apply only to new writes.
-- Re-runnable: Postgres has no ADD CONSTRAINT IF NOT EXISTS, so the
-- constraint is dropped (if present) and re-added.

UPDATE users SET plan = 'premium' WHERE plan NOT IN ('free', 'basic', 'premium');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier;
ALTER TABLE users ADD CONSTRAINT users_plan_tier CHECK (plan IN ('free', 'basic', 'premium'));
