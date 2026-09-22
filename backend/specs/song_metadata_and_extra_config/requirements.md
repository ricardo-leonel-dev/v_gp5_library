# Requirements — song_metadata_and_extra_config

Scope note: `song_crud_api` (feature 3, `done`) already implements `POST /songs`'s "present and
well-formed" validation for `name` (required, non-empty) and `extra_config` (must parse to a JSON
object) — see its own `requirements.md` R2/R8/R9/R10. That same file's scope note explicitly reserves
"deep validation of the `name`/`extra_config` fields beyond present-and-well-formed (a size cap on
`extra_config`, for example)" to this feature, `song_metadata_and_extra_config` (feature 7), which
`depends_on` it. This feature adds no new route and no new migration: it layers additional validation
into the existing `POST /songs` handler in `src/songs/song-service.ts`, the only place in this codebase
that writes `extra_config` today.

Scope note on "create/update": this feature's title/description mention validating metadata "on song
create/update", but no `PATCH`/`PUT` route for updating an existing song's metadata exists anywhere in
this codebase yet (`src/index.ts` only wires `POST /songs`, `GET /songs`, `GET /songs/:id`, `DELETE
/songs/:id`, plus the `song_pedal_configs`/file-streaming routes from later features). This feature's own
stored acceptance criteria (`state/features/007-song_metadata_and_extra_config.md`) reference only
creating a song and reading it back via `GET` — none names an update route. Adding one is therefore out
of scope here; see `design.md`'s "Discarded alternatives" for the full reasoning.

Scope note on `artist`: the title also names `artist` alongside `name`/`extra_config`. `artist` is
already fully handled, unchanged, by `song_crud_api` R11/R12 (optional; stored as given or `NULL` when
omitted) and none of this feature's three acceptance criteria call for any new `artist`-specific rule (no
length cap, no format check). This feature therefore adds no new requirement for `artist` beyond what
`song_crud_api` already covers — inventing one without an acceptance criterion to justify it would
violate `docs/specs.md`'s "never write a requirement you can't map to a concrete test [that a real
acceptance criterion demands]" spirit.

Scope note on the size cap value: the acceptance criteria give an example ("define a cap, e.g. 32KB")
rather than a fixed number. This spec pins that cap at **32768 bytes (32 KiB)**, the literal value named
in the example, measured as the **UTF-8-encoded byte length of the raw `extra_config` request field
string**, before it is parsed as JSON — see `design.md` for why the raw string (not a re-serialized,
already-parsed object) is what gets measured, and why the check runs before `JSON.parse`.

## R1
IF a `POST /songs` request omits the `name` field or the field is an empty string THEN the system SHALL
respond with HTTP 400 and SHALL NOT create any `songs` row.

## R2
WHEN a `POST /songs` request's `extra_config` field parses to a JSON object, the system SHALL store that
exact object as the created song's `extra_config` and SHALL return it unchanged — the same keys, nesting,
array contents, and value types (strings, numbers, booleans, `null`, nested objects/arrays) — from
subsequent `GET /songs` and `GET /songs/:id` responses for that song.

## R3
The system SHALL treat 32768 bytes (32 KiB) as the maximum allowed size of a `POST /songs` request's
`extra_config` field, measured as the UTF-8-encoded byte length of that field's raw string value, before
the field is parsed as JSON.

## R4
IF a `POST /songs` request's `extra_config` field is present and its raw string value's UTF-8-encoded
byte length exceeds the maximum size defined by R3 THEN the system SHALL respond with HTTP 400 and SHALL
NOT create any `songs` row.

## R5
WHEN a `POST /songs` request's `extra_config` field is present, its raw string value's UTF-8-encoded byte
length is less than or equal to the maximum size defined by R3, and it parses to a JSON object, the
system SHALL NOT reject the request on size grounds (the request proceeds through the existing shape
validation and creation described by R2 and `song_crud_api` R8).
