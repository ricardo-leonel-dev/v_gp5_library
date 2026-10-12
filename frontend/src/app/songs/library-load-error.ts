// F26 `library_first_startup` — pure error classifier shared by the
// library page (`SongsPage`, R20-R22) and the detail page
// (`SongDetailPage`, R37-R41). Lives next to `songs-api.service.ts`
// because both pages consume its output.

import { HttpErrorResponse } from '@angular/common/http';

// F26 design §3. `not_found` is the detail-page case (R37) — `GET /songs`
// never returns 404, so the library page treats it as `load_failed`
// (R21). Tests are in `library-load-error.spec.ts`.
export type LibraryLoadError =
  | 'unreachable'
  | 'session_expired'
  | 'not_found'
  | 'load_failed';

export function classifyLoadError(err: unknown): LibraryLoadError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'unreachable';
    if (err.status === 401) return 'session_expired';
    if (err.status === 404) return 'not_found';
  }
  return 'load_failed';
}