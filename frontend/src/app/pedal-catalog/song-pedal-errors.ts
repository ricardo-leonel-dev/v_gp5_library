// F36 R2 / R4 / R7 / R10 — pure classifiers that map HTTP failures
// from `PedalCatalogApi` into the keys the section shows. Never throw;
// a non-HTTP error is treated as the generic key.

import { HttpErrorResponse } from '@angular/common/http';

export type PedalLoadError =
  | 'unreachable'
  | 'session_expired'
  | 'song_not_found'
  | 'load_failed';

export function classifyPedalLoadError(err: unknown): PedalLoadError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'unreachable';
    if (err.status === 401) return 'session_expired';
    if (err.status === 404) return 'song_not_found';
  }
  return 'load_failed';
}

export type AttachErrorKey =
  | 'label_required'
  | 'pedal_gone'
  | 'song_not_found'
  | 'session_expired'
  | 'unreachable'
  | 'attach_failed';

const ATTACH_BODY_KEYS: Readonly<Record<string, AttachErrorKey>> = {
  'label is required': 'label_required',
  'pedal_catalog_id does not reference an existing pedal': 'pedal_gone',
};

export function mapAttachError(err: unknown): AttachErrorKey {
  if (!(err instanceof HttpErrorResponse)) {
    return 'attach_failed';
  }
  const status = err.status;
  if (status === 0) return 'unreachable';
  if (status === 401) return 'session_expired';
  if (status === 404) return 'song_not_found';
  if (status === 400) {
    const message = readStringBody(err);
    if (message !== null && ATTACH_BODY_KEYS[message] !== undefined) {
      return ATTACH_BODY_KEYS[message]!;
    }
    return 'attach_failed';
  }
  return 'attach_failed';
}

export type DetachErrorKey =
  | 'already_detached'
  | 'session_expired'
  | 'unreachable'
  | 'detach_failed';

export function mapDetachError(err: unknown): DetachErrorKey {
  if (!(err instanceof HttpErrorResponse)) {
    return 'detach_failed';
  }
  const status = err.status;
  if (status === 0) return 'unreachable';
  if (status === 401) return 'session_expired';
  if (status === 404) return 'already_detached';
  return 'detach_failed';
}

function readStringBody(err: HttpErrorResponse): string | null {
  const body = err.error;
  if (!body || typeof body !== 'object') return null;
  const value = (body as { error?: unknown }).error;
  return typeof value === 'string' ? value : null;
}