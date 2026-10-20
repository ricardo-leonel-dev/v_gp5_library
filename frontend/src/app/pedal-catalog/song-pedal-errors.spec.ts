import { describe, expect, it } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import {
  classifyPedalLoadError,
  mapAttachError,
  mapDetachError,
} from './song-pedal-errors';

// F36 R2 / R4 — `classifyPedalLoadError` maps the four load cases
// (0/401/404/other). The catalog branch maps `load_failed` and
// `song_not_found` to `catalog_failed`, since `GET /pedals` never
// returns 404 in practice. Pure unit, no Angular DI.
describe('classifyPedalLoadError (F36 R2, R4)', () => {
  it.each([
    { name: 'status 0', err: new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' }), want: 'unreachable' },
    { name: 'status 401', err: new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }), want: 'session_expired' },
    { name: 'status 404', err: new HttpErrorResponse({ status: 404, statusText: 'Not Found' }), want: 'song_not_found' },
    { name: 'status 500', err: new HttpErrorResponse({ status: 500, statusText: 'Server Error' }), want: 'load_failed' },
    { name: 'non-HTTP error', err: new Error('boom'), want: 'load_failed' },
    { name: 'plain string thrown', err: 'nope', want: 'load_failed' },
  ])('$name → $want', ({ err, want }) => {
    expect(classifyPedalLoadError(err)).toBe(want);
  });
});

// F36 R7 — `mapAttachError` reads the HTTP status and (for 400s) the
// body string. The exact strings come from the backend service; any
// other 400 message → `attach_failed`.
describe('mapAttachError (F36 R7)', () => {
  it.each([
    {
      name: 'a: 400 label is required → label_required',
      err: httpErr(400, { error: 'label is required' }),
      want: 'label_required',
    },
    {
      name: 'b: 400 pedal_catalog_id does not reference → pedal_gone',
      err: httpErr(400, { error: 'pedal_catalog_id does not reference an existing pedal' }),
      want: 'pedal_gone',
    },
    {
      name: 'c: 404 → song_not_found',
      err: httpErr(404, { error: 'song not found' }),
      want: 'song_not_found',
    },
    {
      name: 'd: 401 → session_expired',
      err: httpErr(401, { error: 'unauthorized' }),
      want: 'session_expired',
    },
    {
      name: 'e: status 0 → unreachable',
      err: httpErr(0, null),
      want: 'unreachable',
    },
    {
      name: 'f1: 500 → attach_failed',
      err: httpErr(500, { error: 'boom' }),
      want: 'attach_failed',
    },
    {
      name: 'f2: another 400 message → attach_failed',
      err: httpErr(400, { error: 'config must be a JSON object' }),
      want: 'attach_failed',
    },
    {
      name: 'f3: 400 with no body → attach_failed',
      err: httpErr(400, null),
      want: 'attach_failed',
    },
    {
      name: 'non-HTTP error → attach_failed',
      err: new Error('boom'),
      want: 'attach_failed',
    },
  ])('$name', ({ err, want }) => {
    expect(mapAttachError(err)).toBe(want);
  });
});

// F36 R10 — `mapDetachError`. 404 → `already_detached`, others follow the
// shared unreachable/session_expired/detach_failed pattern.
describe('mapDetachError (F36 R10)', () => {
  it.each([
    { name: 'a: 404 → already_detached', err: httpErr(404, { error: 'song pedal config not found' }), want: 'already_detached' },
    { name: 'b: 401 → session_expired', err: httpErr(401, { error: 'unauthorized' }), want: 'session_expired' },
    { name: 'c: status 0 → unreachable', err: httpErr(0, null), want: 'unreachable' },
    { name: 'd1: 500 → detach_failed', err: httpErr(500, { error: 'boom' }), want: 'detach_failed' },
    { name: 'd2: non-HTTP error → detach_failed', err: new Error('boom'), want: 'detach_failed' },
  ])('$name', ({ err, want }) => {
    expect(mapDetachError(err)).toBe(want);
  });
});

function httpErr(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: status === 0 ? 'Unknown Error' : 'Error',
    error: body ?? null,
  });
}