- [x] T1 (R1) No code change: confirm `createSong`'s existing `if (!input.name || input.name.trim() ===
      "")` check (`song_crud_api` R2) already satisfies R1 unchanged. Traceability for R1 cites the
      pre-existing tests `"missing name -> SongError(400) and no rows inserted (R2)"` and `"empty string
      name -> SongError(400) (R2)"` in `src/songs/song-service.test.ts` — no new test is added for R1
      since no new behavior exists to test.
- [x] T2 (R3, R4) In `src/songs/song-service.ts`: add `export const MAX_EXTRA_CONFIG_BYTES = 32768;` and,
      inside `createSong`, add the UTF-8 byte-length check on `input.extraConfig` (when defined) before
      the existing `JSON.parse` call, throwing `SongError(\`extra_config exceeds maximum size of
      ${MAX_EXTRA_CONFIG_BYTES} bytes\`, 400)` when the byte length exceeds the cap.
- [x] T3 (R5) Confirm the check added in T2 uses strict `>` (not `>=`), so a value exactly at
      `MAX_EXTRA_CONFIG_BYTES` bytes falls through to the existing parse/shape validation unchanged.
- [x] T4 (R2) Add a test in `src/songs/song-service.test.ts`: `createSong` with an `extraConfig` JSON
      string containing a nested object, an array, a string, a number, a boolean, and `null`; assert the
      returned `SongWithFilesDto.extraConfig` and a subsequent `getSongById` call's `extraConfig` both
      deep-equal the original structure exactly.
- [x] T5 (R4) Add a test in `src/songs/song-service.test.ts`: an `extraConfig` string whose UTF-8 byte
      length exceeds `MAX_EXTRA_CONFIG_BYTES` (e.g. built via `` `{"note":"${"x".repeat(MAX_EXTRA_CONFIG_BYTES)}"}` ``)
      is rejected with `SongError(400)` whose message names the byte cap, and no `songs`/`song_files` rows are
      inserted.
- [x] T6 (R5) Add a test in `src/songs/song-service.test.ts`: an `extraConfig` string whose UTF-8 byte
      length is exactly `MAX_EXTRA_CONFIG_BYTES` and parses to a valid JSON object is **not** rejected —
      `createSong` resolves normally with that object stored.
- [x] T7 (R4) Add a test to `src/index.test.ts`: a real `POST /songs` multipart request (valid bearer
      token, one preset file, an oversized `extra_config` field) returns HTTP 400 — proving the cap is
      enforced end-to-end through the real route, not just unit-testable in isolation.
- [x] T8 (R2) Add a test to `src/index.test.ts`: a real `POST /songs` multipart request with a nontrivial
      `extra_config` object, followed by `GET /songs/:id`, round-trips that object unchanged through the
      full HTTP stack.
