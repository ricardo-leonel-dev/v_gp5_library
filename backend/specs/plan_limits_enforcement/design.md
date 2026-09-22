# Design — plan_limits_enforcement

## No schema change

`users.plan` already exists (`0001_init.sql`) and needs no new column, migration, or index. This
feature is enforced entirely in application code, in `src/songs/song-service.ts` — the same file that
already validates `name`, file counts, and `extra_config` (`song_crud_api`, `song_metadata_and_extra_config`).

## No new route

Per `requirements.md`'s scope note, `POST /songs` (`createSong`) is the only place a `songs` row is ever
created (import re-uses this same route). No new endpoint is added; `src/index.ts`'s existing
`protectedRouter.post("/songs", ...)` handler needs **no code change** — it already does
`catch (err) { if (err instanceof SongError) return c.json({ error: err.message }, err.status); }`,
which handles a newly-possible `402` exactly like the existing `400`/`404` cases once `SongError`'s
status type is widened (below).

## Files to touch

### `src/songs/song-service.ts`

**1. Widen `SongError`'s status type** from `400 | 404` to `400 | 402 | 404` (R2, R7).

**2. Add a module-level constant** next to `MAX_EXTRA_CONFIG_BYTES` (same file, same "one small
feature-specific constant, no separate config module" pattern — see "Discarded alternatives"):

```ts
// Any plan value not listed here has no song-count limit (R4).
export const PLAN_SONG_LIMITS: Record<string, number> = {
  free: 10, // R1, R2
};
```

**3. Move the existing `const db = getDb();` earlier** in `createSong` — today it's declared
immediately before `db.begin(...)`; this feature needs a `db` handle earlier, for the plan/count
pre-check below. No other change to how `db` is used later in the function.

**4. Insert the plan/count check** right after the existing `extraConfig` validation block finishes
(the `extraConfig = parsed as Record<string, unknown>;` line) and **before** `const songId =
crypto.randomUUID();`/`filesToCreate`/any `storage.put` call — i.e. before any file bytes are written,
so a rejected request never performs wasted storage I/O:

```ts
const [userRow] = await db<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${userId}`;
if (!userRow) {
  throw new SongError("user not found", 404); // R7
}

const limit = PLAN_SONG_LIMITS[userRow.plan];
if (limit !== undefined) {
  const [{ count }] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM songs WHERE user_id = ${userId} AND deleted_at IS NULL
  `; // R5 — deleted_at IS NULL excludes soft-deleted songs from the count
  if (count >= limit) {
    throw new SongError(`plan '${userRow.plan}' is limited to ${limit} songs`, 402); // R2, R3
  }
}
```

`userRow.plan` is queried fresh on every call (R6) — `createSong`'s signature already takes only
`userId` (never a `plan` argument from the caller/JWT), so there is nothing here to accidentally trust
the token's `plan` claim with. A `plan` value not present in `PLAN_SONG_LIMITS` (e.g. any future
non-`free` tier) skips the count query entirely — R4's "no rejection" behavior falls out of the `limit
!== undefined` guard, not a second code path.

No change to `CreateSongInput`, `SongDto`, `createSong`'s exported signature, or any other exported
type — `PLAN_SONG_LIMITS` is the only new export.

### `src/songs/song-service.test.ts`

New tests, colocated per `docs/conventions.md`, using the file's existing `makeUser`/`seedSong`
helpers (`makeUser` already inserts a `users` row with the default `plan = 'free'`; a `plan` override
needs a direct `INSERT`/`UPDATE` matching the file's existing direct-SQL style):
- R1: a free-plan user with 9 existing songs (via `seedSong` in a loop) successfully creates a 10th.
- R2/R3: a free-plan user with 10 existing songs has an 11th `createSong` call throw
  `SongError` with `status === 402` and a message containing `"free"` and `"10"`; assert the `songs`
  row count for that user is unchanged (same "no rows inserted" pattern the file's existing R2/R9 tests
  use).
- R4: a user created with `plan = 'paid'` (direct `INSERT`) can create 11+ songs without rejection.
- R5: a free-plan user with 10 songs, one of them soft-deleted (`UPDATE songs SET deleted_at = NOW()`,
  mirroring `deleteSong`'s own update), can create an 11th song successfully (live count is 9).
- R7: `createSong` called with a `userId` that has no matching `users` row throws `SongError` with
  `status === 404`.

### `src/index.test.ts`

Two HTTP-level additions, proving the checks are reachable through the real route (mirrors
`song_metadata_and_extra_config`'s own precedent for this):
- R2/R3: a free-plan user performs 10 real `POST /songs` multipart requests (all succeed), then an
  11th returns HTTP 402 with an `error` field naming the limit.
- R6: a token is issued via `issueToken(userId, "paid")` for a user whose actual `users.plan` row is
  `free` (a stale/mismatched claim — simulating a token issued before a plan change, or a tampered
  claim) is still capped at 10 songs through the real route, proving the DB value — not the token's
  embedded claim — governs the check.

## Error handling

Reuses the existing `SongError` class, its status type widened to `400 | 402 | 404` — no new error
type. The over-limit case is just another `SongError(message, 402)` thrown from `createSong`, caught
by `POST /songs`'s existing `catch (err) { if (err instanceof SongError) ... }` block in
`src/index.ts` (unchanged, per "No new route" above).

## Discarded alternatives

**Lock the `users` row with `SELECT ... FOR UPDATE` inside a transaction spanning the count-check and
the insert**, to close the TOCTOU race where two concurrent `POST /songs` requests for the same user
could both pass the count check before either commits. Rejected: this feature's own description
explicitly frames it as "low priority... not needed until a plan/billing feature exists" — the
codebase's existing `createSong` flow is already not atomic on other failure paths today (e.g. if the
`db.begin` transaction's `INSERT` fails for an unrelated reason, the `storage.put` bytes written just
before it are never rolled back), so this feature is not the first place in this codepath to leave a
narrow race window, and closing it here would add real complexity (an extra `FOR UPDATE` transaction
wrapping two round trips) for a guarantee nothing in the acceptance criteria asks for. A future feature
built on a real billing product can add stricter concurrency guarantees if that product actually needs
them.

**Trust `c.get('plan')` (the JWT's embedded `plan` claim, already set by `requireAuth` — see
`src/middleware/require-auth.ts`) instead of querying `users.plan` fresh.** Rejected: `issueToken`'s
default expiry is 7 days (`JWT_EXPIRES_IN`). If enforcement trusted the token's claim, a user who
upgrades mid-session would stay capped at the free limit until their existing token expires and they
log in again, and a user who's downgraded would keep whatever higher/unlimited cap their stale token
still claims for that same window. Querying `users.plan` fresh on every `POST /songs` makes a plan
change take effect on the very next request — this is also why `createSong`'s signature deliberately
takes no `plan` parameter at all (R6).

**Add a separate `src/config/plan-limits.ts` module**, mirroring `src/config/stage.ts`
(`stage_aware_provider_config`, feature 10). Rejected: today only one resource type (songs) has a
plan-based limit, and `MAX_EXTRA_CONFIG_BYTES` (`song_metadata_and_extra_config`) already established
this codebase's precedent — a small, feature-specific numeric constant lives directly in
`song-service.ts`, next to the one function that enforces it, rather than in its own module. Introducing
a new top-level `src/config/` file for a single map used from a single call site would be premature
abstraction ahead of an actual second consumer (e.g. a future per-plan cap on `song_files` or
`pedal_catalog` rows).

**Respond with HTTP 403 Forbidden instead of 402 Payment Required.** Rejected: the acceptance criteria
explicitly allow either; 402 more precisely signals "this action requires paying/upgrading" than 403's
more generic "not permitted regardless of any action the caller could take" — consistent with
`AuthError`'s own precedent of picking the most semantically specific status among plausible options
(409 for a duplicate email at registration, not a generic 400).
