# Requirements — plan_tiers_songs_and_presets_per_song_limits

## Open questions / decisions for the human reviewer

Each item is a choice this spec makes where the feature's acceptance is ambiguous. Approving the spec
approves these choices; say so if any should change.

- **D1 — Read endpoint is a new `GET /me/plan`.** `GET /auth/me` (returns `{id, email, plan}`) is left
  unchanged. `GET /me` does not exist and is not added. Response:
  `{ plan, limits: { songs, presetsPerSong }, usage: { songs } }`, `null` meaning unlimited.
- **D2 — Only `POST /songs` enforces limits.** It is the only endpoint that creates songs or presets
  (import re-uses it; feature 15 R29 makes every preset-mutation route 404). No other route checks
  limits. A future endpoint that adds presets to an existing song must add its own check.
- **D3 — Existing over-limit data is never blocked except for new songs.** A user above the song limit
  can still list, read, export and delete songs, and can still add/remove pedal configs on them. Only a
  new `POST /songs` is refused. A song already holding more presets than the tier allows stays fully
  readable and exportable. There is no endpoint that edits an existing song's presets, so "an update
  that would exceed the limit on an over-limit song" cannot happen today.
- **D4 — Tier assignment.** New registrations stay `free` (existing column default). There is no API
  to change a plan in this feature; a plan changes only by updating `users.plan` directly (future
  billing feature). The plan is read from the database on every request, never from the JWT claim
  (same as feature 9 R6).
- **D5 — Migration 0005 normalizes and constrains `users.plan`.** Any value other than
  `free`/`basic`/`premium` (today only test-created `'paid'` rows exist; there is no production data)
  becomes `premium`, because such users are unlimited today and `premium` keeps them unlimited. Then a
  CHECK constraint allows only the three tiers. `free` users keep `free`. No `songs`/`song_files` row is
  touched.
- **D6 — Existing free users are not grandfathered.** A `free` user who owns 2..10 live songs (allowed
  under the old 10-song limit) keeps them all, readable, but cannot create another song until the live
  count drops below 1.
- **D7 — Check order.** All existing 400 validations run first. Then the song-count check, then the
  preset-count check. A request that breaks both limits gets `plan_song_limit`.
- **D8 — 402 body shape.** `{ error, code, plan, limit }` where `code` is `"plan_song_limit"` or
  `"plan_preset_limit"`, `plan` is the caller's tier, `limit` is the number that was exceeded. `error`
  stays a human-readable English string.
- **D9 — Concurrency race not closed.** Two concurrent `POST /songs` can both pass the count check
  (same accepted trade-off as feature 9's design). Not addressed here.
- **D10 — Unknown user on `GET /me/plan` returns 404** with `{error: "user not found"}`, matching
  `createSong`'s existing 404, not `getMe`'s 401.

## Scope note

Today `users.plan` is a free-form `VARCHAR(50) NOT NULL DEFAULT 'free'` (`0001_init.sql`), and
`src/songs/song-service.ts` has `PLAN_SONG_LIMITS = { free: 10 }`: `free` users may own up to 10 live
songs, every other plan value is unlimited, and there is no preset limit. This feature replaces that
with three tiers and two limits, and adds a read endpoint.

| Tier | Max live songs | Max presets per song |
|---|---|---|
| `free` | 1 | 1 |
| `basic` | 2 | 2 |
| `premium` | unlimited | unlimited |

Terms used below:
- **Live song**: a `songs` row with `deleted_at IS NULL` owned by the caller.
- **N**: the number of `preset` file parts in a `POST /songs` request (feature 15).
- **Caller's plan**: the `users.plan` value read from the database during the request.
- **Song-limit rejection**: HTTP 402 with body `code = "plan_song_limit"`.
- **Preset-limit rejection**: HTTP 402 with body `code = "plan_preset_limit"`.
- **Migration 0005**: the new file `src/db/migrations/0005_plan_tiers.sql`.
- **Nothing persisted**: no new `songs` row, no new `song_files` row and no `StorageAdapter.put` call.

This supersedes `plan_limits_enforcement` R1–R4 (10-song free limit, non-free unlimited) and
`multiple_presets_per_song` R30. `plan_limits_enforcement` R5–R7 still hold and are restated here for
the new tiers where needed.

## Schema and migration

## R1
WHEN migration 0005 has been applied, the system SHALL reject an INSERT or UPDATE that sets
`users.plan` to a value other than `free`, `basic` or `premium` with a database error.

## R2
WHEN migration 0005 runs on a database containing a `users` row whose `plan` is not `free`, `basic` or
`premium`, the system SHALL set that row's `plan` to `premium`.

## R3
WHEN migration 0005 runs, the system SHALL leave every `users` row whose `plan` is `free`, `basic` or
`premium` with the same `plan` value.

## R4
WHEN migration 0005 runs, the system SHALL leave the number of `users`, `songs` and `song_files` rows
unchanged.

## R5
WHEN the SQL of migration 0005 is executed again against a database where it has already been applied,
the system SHALL complete without error.

## Song limit on `POST /songs`

## R6
WHEN an authenticated `free`-plan caller who owns 0 live songs sends an otherwise valid `POST /songs`
with N = 1, the system SHALL create the song and respond with HTTP 201.

## R7
IF an authenticated `free`-plan caller who owns 1 or more live songs sends an otherwise valid
`POST /songs` THEN the system SHALL respond with a song-limit rejection.

## R8
WHEN an authenticated `basic`-plan caller who owns 1 live song sends an otherwise valid `POST /songs`
with N = 2, the system SHALL create the song and respond with HTTP 201.

## R9
IF an authenticated `basic`-plan caller who owns 2 or more live songs sends an otherwise valid
`POST /songs` THEN the system SHALL respond with a song-limit rejection.

## R10
WHEN an authenticated `premium`-plan caller who owns 3 or more live songs sends an otherwise valid
`POST /songs` with N = 3, the system SHALL create the song and respond with HTTP 201.

## Preset-per-song limit on `POST /songs`

## R11
IF an authenticated `free`-plan caller who owns 0 live songs sends an otherwise valid `POST /songs`
with N = 2 THEN the system SHALL respond with a preset-limit rejection.

## R12
IF an authenticated `basic`-plan caller who owns fewer than 2 live songs sends an otherwise valid
`POST /songs` with N = 3 THEN the system SHALL respond with a preset-limit rejection.

## R13
IF an authenticated caller's `POST /songs` request exceeds both the song limit and the preset limit of
the caller's plan THEN the system SHALL respond with a song-limit rejection.

## Rejection body and side effects

## R14
WHEN the system responds with a song-limit or preset-limit rejection, the system SHALL respond with
HTTP status 402.

## R15
WHEN the system responds with a song-limit or preset-limit rejection, the system SHALL return a JSON
body with exactly the keys `error` (non-empty string), `code` (string), `plan` (the caller's plan) and
`limit` (the numeric limit that was exceeded).

## R16
WHEN the system responds with a song-limit or preset-limit rejection, the system SHALL have persisted
nothing.

## R17
IF a `POST /songs` request fails one of the existing 400 validations (missing name, zero presets,
unreadable preset name, cover count, `extra_config`) THEN the system SHALL respond with HTTP 400, even
when the caller is also over a plan limit.

## Counting and plan source

## R18
The system SHALL count only `songs` rows whose `deleted_at IS NULL` toward a caller's live-song count
for the song-limit check and for `GET /me/plan`'s `usage.songs`.

## R19
The system SHALL read the caller's plan for the limit checks and for `GET /me/plan` from the `users`
table during that request, not from the JWT `plan` claim.

## Read endpoint `GET /me/plan`

## R20
WHEN an authenticated caller sends `GET /me/plan`, the system SHALL respond with HTTP 200 and a JSON
body `{ plan, limits: { songs, presetsPerSong }, usage: { songs } }` whose `plan` is the caller's plan.

## R21
WHEN `GET /me/plan` responds for a `free` caller, the system SHALL return `limits` equal to
`{ songs: 1, presetsPerSong: 1 }`.

## R22
WHEN `GET /me/plan` responds for a `basic` caller, the system SHALL return `limits` equal to
`{ songs: 2, presetsPerSong: 2 }`.

## R23
WHEN `GET /me/plan` responds for a `premium` caller, the system SHALL return `limits` equal to
`{ songs: null, presetsPerSong: null }`.

## R24
WHEN `GET /me/plan` responds, the system SHALL set `usage.songs` to the caller's current live-song
count.

## R25
IF `GET /me/plan` is requested without a valid Bearer token THEN the system SHALL respond with HTTP 401.

## R26
IF `GET /me/plan` is requested with a valid token whose user has no `users` row THEN the system SHALL
respond with HTTP 404.

## Existing over-limit data stays readable

## R27
WHILE a caller owns more live songs than the caller's plan allows, the system SHALL return all of those
songs from `GET /songs`.

## R28
WHILE a song holds more presets than the owner's plan allows per song, the system SHALL return every
one of that song's presets in the `presets` array of `GET /songs/:id`.

## R29
WHILE a song holds more presets than the owner's plan allows per song, the system SHALL serve each of
those presets from `GET /songs/:id/files/preset?sort_order=n` with HTTP 200.
