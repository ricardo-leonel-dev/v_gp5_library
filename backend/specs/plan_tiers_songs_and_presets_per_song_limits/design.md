# Design — plan_tiers_songs_and_presets_per_song_limits

Follows the layering in `docs/architecture.md`: routes in `src/index.ts`, business logic and SQL in a
`*-service.ts`, schema changes as plain `.sql` migrations. Naming, English error strings, colocated
`bun:test` tests and the soft-delete filter come from `docs/conventions.md`. No new dependency.

## Files to touch

| File | Change |
|---|---|
| `src/db/migrations/0005_plan_tiers.sql` | **New.** Normalize legacy plan values to `premium`, add CHECK (R1–R5). |
| `src/plans/plan-service.ts` | **New.** `Plan` type, `PLAN_LIMITS`, `PlanLimitError`, `PlanError`, `getUserPlan`, `countLiveSongs`, `checkPlanLimits`, `getPlanSummary` (R6–R26). |
| `src/plans/plan-service.test.ts` | **New.** Unit tests for the tier table and `getPlanSummary`. |
| `src/songs/song-service.ts` | Remove `PLAN_SONG_LIMITS` and the inline plan/count block; replace it with `getUserPlan` + `countLiveSongs` + `checkPlanLimits` in the same place. |
| `src/index.ts` | `POST /songs` catches `PlanLimitError` before `SongError`; new `protectedRouter.get("/me/plan", ...)`. |
| `src/db/migrate.test.ts` | Add `0005_plan_tiers.sql` to the expected list; R1–R5 tests. |
| `src/songs/song-service.test.ts`, `src/index.test.ts` | Rewrite the feature-9 tests and F15 R30 test; make helpers create `premium` users by default (see "Test impact"). |

## Migration `0005_plan_tiers.sql`

Re-runnable (R5), same style as 0004 (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`):

```sql
UPDATE users SET plan = 'premium' WHERE plan NOT IN ('free', 'basic', 'premium');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier;
ALTER TABLE users ADD CONSTRAINT users_plan_tier CHECK (plan IN ('free', 'basic', 'premium'));
```

Header comment: legacy non-tier values (only `'paid'` from feature-9 tests is known) were unlimited
under the old rule, so they map to `premium`, which keeps them unlimited (D5). The column type and
default `'free'` are unchanged. No `songs`/`song_files` change: limits apply only to new writes (R4).

R2 test: drop the constraint, `UPDATE` a fresh user to `'paid'`, re-execute the file via
`db.unsafe(await readFile(...))`, assert the row is `premium` and the constraint exists again.

## `src/plans/plan-service.ts`

A new module because there are now two consumers (`createSong` and `GET /me/plan`) and two limits;
the feature-9 "keep the constant in song-service.ts" reasoning no longer holds.

```ts
export type Plan = "free" | "basic" | "premium";

export interface PlanLimits {
  songs: number | null;          // null = unlimited
  presetsPerSong: number | null; // null = unlimited
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { songs: 1, presetsPerSong: 1 },
  basic: { songs: 2, presetsPerSong: 2 },
  premium: { songs: null, presetsPerSong: null },
};

export type PlanLimitCode = "plan_song_limit" | "plan_preset_limit";

export class PlanLimitError extends Error {
  readonly status = 402;
  constructor(
    message: string,
    public readonly code: PlanLimitCode,
    public readonly plan: Plan,
    public readonly limit: number,
  ) {
    super(message);
  }
}

export interface PlanSummaryDto {
  plan: Plan;
  limits: PlanLimits;
  usage: { songs: number };
}

export class PlanError extends Error {
  constructor(message: string, public readonly status: 404) { super(message); }
}

export async function getUserPlan(db: SQL, userId: string): Promise<Plan | null>;
export async function countLiveSongs(db: SQL, userId: string): Promise<number>;
export function checkPlanLimits(plan: Plan, liveSongCount: number, presetCount: number): void;
export async function getPlanSummary(userId: string): Promise<PlanSummaryDto>;
```

`plan-service.ts` never imports from `src/songs/` (keeps the import graph acyclic: `song-service.ts`
imports `plan-service.ts`, not the reverse).

- `getUserPlan`: `SELECT plan FROM users WHERE id = ${userId}` (R19). Returns `null` when no row. The
  CHECK guarantees the value is a `Plan`; cast it.
- `countLiveSongs`: `SELECT COUNT(*)::int AS count FROM songs WHERE user_id = ${userId} AND deleted_at
  IS NULL` (R18). Same query feature 9 used.
- `checkPlanLimits` (pure; order is D7):
  1. `limits.songs !== null && liveSongCount >= limits.songs` →
     `PlanLimitError(\`plan '${plan}' is limited to ${limits.songs} songs\`, "plan_song_limit", plan,
     limits.songs)` (R7, R9, R13).
  2. `limits.presetsPerSong !== null && presetCount > limits.presetsPerSong` →
     `PlanLimitError(\`plan '${plan}' is limited to ${limits.presetsPerSong} presets per song\`,
     "plan_preset_limit", plan, limits.presetsPerSong)` (R11, R12).
- `getPlanSummary`: `getUserPlan` → `null` → `PlanError("user not found", 404)` (R26, D10); otherwise
  `{ plan, limits: PLAN_LIMITS[plan], usage: { songs: await countLiveSongs(...) } }` (R20–R24). Uses
  `getDb()`.

## `createSong` changes

Replace the block from `const [userRow] = ...` to the end of the song-count `if` with:

```ts
const plan = await getUserPlan(db, userId);
if (plan === null) {
  throw new SongError("user not found", 404); // plan_limits_enforcement R7, unchanged
}
const limits = PLAN_LIMITS[plan];
const liveSongs = limits.songs === null ? 0 : await countLiveSongs(db, userId);
checkPlanLimits(plan, liveSongs, input.preset.length);
```

`premium` skips the count query. The position stays the same: after every 400 validation (including
`readPresetName` on every preset) and before `songId`/`filesToCreate`/`storage.put` (R16, R17). N is
`input.preset.length`, exact because every preset in a `POST /songs` is new. Remove the exported
`PLAN_SONG_LIMITS`. Narrow `SongError`'s status union to `400 | 404`: 402 now comes only from
`PlanLimitError` (grep for other `402` uses first; keep it if any remain).

## Route changes (`src/index.ts`)

`POST /songs` catch block:

```ts
} catch (err) {
  if (err instanceof PlanLimitError) {
    return c.json({ error: err.message, code: err.code, plan: err.plan, limit: err.limit }, 402);
  }
  if (err instanceof SongError) return c.json({ error: err.message }, err.status);
  throw err;
}
```

New route, registered on `protectedRouter` (so `requireAuth` gives R25 for free and the unknown-route
guard knows the path):

```ts
protectedRouter.get("/me/plan", async (c) => {
  try {
    return c.json(await getPlanSummary(c.get("userId")));
  } catch (err) {
    if (err instanceof PlanError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});
```

`GET /auth/me` is unchanged (D1). Other routes (`GET /songs`, `GET /songs/:id`, file export,
`DELETE /songs/:id`, `/songs/:id/pedals*`) get no plan check, which is what R27–R29 and D3 rely on.

## Error paths

| Condition | Status | Body |
|---|---|---|
| any existing 400 validation | 400 | `{error}` (unchanged; wins over plan limits, R17) |
| caller has no `users` row on `POST /songs` | 404 | `{error: "user not found"}` (unchanged) |
| live songs >= tier song limit | 402 | `{error, code: "plan_song_limit", plan, limit}` |
| N > tier preset limit | 402 | `{error, code: "plan_preset_limit", plan, limit}` |
| `GET /me/plan`, no/invalid token | 401 | `{error}` from `requireAuth` |
| `GET /me/plan`, no `users` row | 404 | `{error: "user not found"}` |
| `users.plan` set to unknown value | DB error | CHECK violation; only reachable by a code bug or manual SQL, propagates (principle 3) |

## Test impact (important for the implementer)

With `free` capped at 1 song and 1 preset, and `users.plan` defaulting to `free`, **many existing tests
that create 2+ songs or a song with 2+ presets for a fresh user will start getting 402.** Fix by
making the test helpers create `premium` users by default and opting into `free`/`basic` only in
limit tests:
- `song-service.test.ts` `makeUser`: insert/update with `plan = 'premium'` unless a `plan` argument is
  given.
- `index.test.ts` `makeUserToken` (and any test that registers via `/auth/register` and then creates
  more than one song or a multi-preset song): `UPDATE users SET plan = 'premium'` after registering.
- Feature-9 tests (`song-service.test.ts` ~L458–560, `index.test.ts` ~L446–520) assert the old 10-song
  rule and use `plan = 'paid'`, which migration 0005's CHECK now rejects. Rewrite them to the new tiers
  (they become the R6–R19 tests). Keep the "stale JWT claim" test (feature-9 R6 / R19 here): token
  issued as `premium` for a `free` DB user is still capped at 1 song.
- `song-service.test.ts` "free-plan user with 9 live songs creates a 10th with 3 presets (R30)" is
  superseded; replace it with the `premium` R10 test.
- Tests in other files that insert users directly (e.g. `song-pedal-config-service.test.ts`,
  `auth.test.ts`) are unaffected unless they set a non-tier plan value — grep for `plan` to confirm.

Superseded spec requirements (leader may add notes to those spec files; spec authors and implementers
do not edit other features' specs): `plan_limits_enforcement` R1, R2, R3 (message still names plan
and limit, but the numbers change), R4; `multiple_presets_per_song` R30.

## Discarded alternatives

1. **Extend `GET /auth/me` with `limits`/`usage` instead of a new route.** Rejected: `/auth/me` is the
   identity endpoint and is also used right after login; adding a `COUNT(*)` to it costs a query on
   every identity check, and the acceptance names `/me/plan` as an option. A dedicated route keeps the
   plan contract separate and lets the frontend poll it before submitting a song.
2. **Keep `users.plan` free-form, treat unknown values as `premium` at runtime.** Rejected: a typo in a
   manual `UPDATE` (e.g. `'Premium'`) would silently grant unlimited access. A CHECK makes bad values
   impossible, and the one-time normalization keeps today's unlimited users unlimited.
3. **Treat unknown legacy values as `free`.** Rejected: users who were unlimited under feature 9 would
   suddenly be capped at 1 song and 1 preset, which is a worse surprise than staying unlimited.
4. **Store limits in a `plans` table.** Rejected: three fixed tiers that change only with a code
   release; a table adds a join and a seed migration for no current need. A billing feature can move
   them later.
5. **Enforce the preset limit with a DB trigger on `song_files`.** Rejected: `docs/architecture.md`
   already rejects per-song row caps at the schema level; the limit depends on the owner's plan
   (cross-table), and a trigger would also block reading/restoring over-limit legacy data paths.
6. **Return the 402 via `SongError` with a free-form `details` object.** Rejected: every other
   `SongError` serializes as `{error}` only; a dedicated `PlanLimitError` makes the stable `code`,
   `plan` and `limit` fields type-checked and impossible to forget.

## Visual direction

Not applicable. Backend-only feature; the frontend consumes `GET /me/plan` and the 402 `code` in a
separate frontend feature.
