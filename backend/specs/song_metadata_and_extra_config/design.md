# Design — song_metadata_and_extra_config

## No schema change

`songs.extra_config` is already `JSONB NOT NULL DEFAULT '{}'::JSONB` (`0001_init.sql`). This feature adds
no `src/db/migrations/*.sql` file — the size cap is enforced in application code, in
`src/songs/song-service.ts`, the same file that already validates `name`'s presence and `extra_config`'s
JSON shape (`song_crud_api`'s `createSong`).

## No new route

Per `requirements.md`'s scope note, no `PATCH`/`PUT /songs/:id` route exists yet and none is added here.
Every requirement in this feature is enforced inside the existing `createSong` function, reached only via
`POST /songs`.

## Files to touch

### `src/songs/song-service.ts`

Add an exported constant and one new validation step in `createSong`, between the existing cover-count
check (R3/R7 from `song_crud_api`, unchanged) and the existing `extra_config` parse/shape check (R8/R9/R10
from `song_crud_api`, unchanged):

```ts
export const MAX_EXTRA_CONFIG_BYTES = 32768; // 32 KiB — R3

// ...inside createSong, before `let extraConfig: Record<string, unknown> = {};`:
if (input.extraConfig !== undefined) {
  const byteLength = new TextEncoder().encode(input.extraConfig).length;
  if (byteLength > MAX_EXTRA_CONFIG_BYTES) {
    throw new SongError(
      `extra_config exceeds maximum size of ${MAX_EXTRA_CONFIG_BYTES} bytes`,
      400,
    );
  }
}
```

This runs on `input.extraConfig` (the raw string from the multipart form field, per
`parse-multipart.ts`'s `toStringField`) **before** the existing `JSON.parse(input.extraConfig)` call a few
lines below it — R4's check short-circuits on an oversized payload without ever parsing it, and R5's
"not rejected on size grounds" behavior falls out naturally from using `>` (not `>=`): a byte length
exactly equal to `MAX_EXTRA_CONFIG_BYTES` passes this check and falls through to the existing
parse/shape validation unchanged.

No change to `CreateSongInput`, `SongDto`, `toSongDto`, `parseExtraConfig`, or any other exported
signature — `MAX_EXTRA_CONFIG_BYTES` is the only new export, added so tests (and any future caller) can
reference the cap instead of hardcoding `32768` a second time.

R2 (round-trip fidelity) requires no code change: `toSongDto`'s `extraConfig: parseExtraConfig(row.extra_config)`
already returns the JSONB column's value as parsed by `Bun.sql`'s Postgres driver, which round-trips
JSON's full value space (objects, arrays, strings, numbers, booleans, `null`) losslessly through `jsonb`
storage — this feature's job for R2 is to *prove* that with a nontrivial fixture (nested object containing
each value type), not to change behavior.

R1 requires no code change either: `createSong`'s existing `if (!input.name || input.name.trim() === "")`
check (`song_crud_api` R2) already satisfies R1 verbatim. See `tasks.md` T1 for how this is traced without
duplicating an already-passing test.

### `src/songs/song-service.test.ts`

New tests, colocated per `docs/conventions.md`:
- R2: a `createSong` call with an `extraConfig` JSON string containing a nested object, an array, a
  string, a number, a boolean, and `null`, asserting the returned `SongWithFilesDto.extraConfig` — and a
  subsequent `getSongById` call's `extraConfig` — both deep-equal the original structure exactly.
- R4: an `extraConfig` string whose UTF-8 byte length exceeds `MAX_EXTRA_CONFIG_BYTES` (built via
  `"x".repeat(...)` inside a minimal valid JSON object, e.g. `` `{"note":"${"x".repeat(MAX_EXTRA_CONFIG_BYTES)}"}` ``)
  is rejected with `SongError(400)` whose message names the byte cap, and no `songs`/`song_files` rows are
  inserted (same assertion pattern `song-service.test.ts`'s existing R2/R9 tests already use for "no rows
  inserted").
- R5: an `extraConfig` string whose UTF-8 byte length is exactly `MAX_EXTRA_CONFIG_BYTES` and parses to a
  valid JSON object is **not** rejected — `createSong` resolves normally.

### `src/index.test.ts`

Two end-to-end additions, proving the checks are actually reachable through the real HTTP route (multipart
`c.req.parseBody` → `parseCreateSongMultipart` → `createSong`), not just unit-testable in isolation:
- R4: a real `POST /songs` multipart request with an oversized `extra_config` field returns HTTP 400.
- R2: a real `POST /songs` then `GET /songs/:id` round-trips a nontrivial `extra_config` object unchanged
  through the full HTTP stack (JSON stringify on the way in via the test's own multipart body construction,
  JSON response body on the way out).

## Error handling

Reuses the existing `SongError` class (`status: 400 | 404`) — no new error type. The size-cap violation is
just another `SongError(message, 400)` thrown from `createSong`, caught by `POST /songs`'s existing
`catch (err) { if (err instanceof SongError) ... }` block in `src/index.ts` (unchanged).

## Discarded alternatives

**Enforce the cap with a Postgres `CHECK` constraint** (e.g. `CHECK (octet_length(extra_config::text) <=
32768)`) added via a new migration file. Rejected: this project's established pattern (`docs/
architecture.md` principle 3) is that every validation failure in `createSong` surfaces as a typed
`SongError(message, 400)` mapped to a structured `{error: message}` JSON response — a raw Postgres
constraint violation would instead surface as an unhandled exception (a 500 with a stack trace), the exact
thing principle 3 says never to let happen for anything the application can validate itself before issuing
the `INSERT`. It would also need a new migration file for a cap that has no interaction with any other row
or table, unlike genuinely relational constraints (e.g. the one-preset-per-song unique index in
`0003_song_files_ordering.sql`).

**Measure the cap against `JSON.stringify(parsedExtraConfig)`'s byte length** (i.e., parse first, then
measure the re-serialized output) rather than the raw incoming string. Rejected: this parses a
potentially-enormous string with `JSON.parse` before any size check runs — wasted work on a request that's
going to be rejected either way once measured — and re-serialization is not guaranteed to reproduce the
same byte count as what the client actually sent (whitespace, key order, or number formatting can differ
between the raw payload and `JSON.stringify`'s output), which would make the enforced cap a property of
this runtime's serializer rather than of the actual request size. Measuring the raw string first is both
cheaper and a truer measure of "payload size."

**Add `PATCH /songs/:id` as part of this feature**, matching the description's "create/update" phrasing
literally. Rejected: not named by this feature's own three acceptance criteria (all reference creating a
song and reading it back via `GET`); no update route exists anywhere in this codebase yet, and one would be
a materially larger, separate concern — a new route, a new service function, its own ownership checks, and
its own questions about partial-update semantics (can `name` be cleared? does `extra_config` merge or
replace?) that deserve their own acceptance criteria rather than being folded silently into this feature.
Mirrors `song_pedal_configs_api`'s own design.md precedent of treating an out-of-acceptance-criteria route
(there, `PATCH` on `song_pedal_configs`) as explicitly out of scope.

**Make the cap configurable via an environment variable** instead of a hardcoded constant. Rejected: no
other numeric validation limit in this codebase (e.g., `createSong`'s "exactly one preset file", "at most
one cover file") is environment-configurable; introducing configuration for only this one cap would be
inconsistent, and nothing in the acceptance criteria asks for it to be tunable at deploy time.
