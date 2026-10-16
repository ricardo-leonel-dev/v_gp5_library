// F4 `save_preset_dialog` — maps `POST /songs` errors to dialog keys/places.
// Pure, never throws. The HTTP error response can carry a JSON body (Hono),
// a plain-text body (Hono's 500 default), or no body at all.

import { HttpErrorResponse } from '@angular/common/http';

export type SaveSongErrorPlace = 'name' | 'extraConfig' | 'banner';

export interface MappedSaveSongError {
  key: string;
  place: SaveSongErrorPlace;
  params?: Record<string, number>;
  loginLink?: true;
}

const PRESET_NAME_UNREADABLE = /^preset file at position (\d+) has no readable GP-5 preset name$/;

export function mapSaveSongError(err: unknown): MappedSaveSongError {
  if (!(err instanceof HttpErrorResponse)) {
    return { key: 'saveSong.errors.unexpected', place: 'banner' };
  }
  const status = err.status;

  // 401 or 404 user-not-found → session expired with login link (R102).
  if (status === 401) {
    return { key: 'saveSong.errors.sessionExpired', place: 'banner', loginLink: true };
  }
  if (status === 404) {
    const body = readBody(err);
    if (body?.error === 'user not found') {
      return { key: 'saveSong.errors.sessionExpired', place: 'banner', loginLink: true };
    }
  }

  if (status === 0) {
    return { key: 'saveSong.errors.network', place: 'banner' };
  }

  if (status === 402) {
    const body = readBody(err);
    const code = body?.code;
    const limit = body?.limit;
    if (code === 'plan_song_limit' && typeof limit === 'number') {
      return { key: 'saveSong.errors.planSongLimit', place: 'banner', params: { limit } };
    }
    if (code === 'plan_preset_limit' && typeof limit === 'number') {
      return { key: 'saveSong.errors.planPresetLimit', place: 'banner', params: { limit } };
    }
    return { key: 'saveSong.errors.planLimitGeneric', place: 'banner' };
  }

  if (status === 400) {
    const body = readBody(err);
    const message = body?.error;
    if (typeof message === 'string') {
      switch (message) {
        case 'name is required':
          return { key: 'saveSong.errors.nameRequired', place: 'name' };
        case 'at least one preset file is required':
          return { key: 'saveSong.errors.presetMissing', place: 'banner' };
        case 'at most one cover file is allowed':
          return { key: 'saveSong.errors.coverTooMany', place: 'banner' };
        case 'extra_config exceeds maximum size of 32768 bytes':
          return { key: 'saveSong.errors.extraConfigTooLarge', place: 'extraConfig' };
        case 'extra_config must be valid JSON':
        case 'extra_config must be a JSON object':
          return { key: 'saveSong.errors.extraConfigInvalid', place: 'extraConfig' };
      }
      // R108 — backend's "preset file at position N has no readable GP-5 preset name".
      const m = PRESET_NAME_UNREADABLE.exec(message);
      if (m) {
        const position = parseInt(m[1], 10) + 1; // backend is 0-based, dialog is 1-based.
        return {
          key: 'saveSong.errors.presetNameUnreadable',
          place: 'banner',
          params: { position },
        };
      }
    }
    return { key: 'saveSong.errors.unexpected', place: 'banner' };
  }

  return { key: 'saveSong.errors.unexpected', place: 'banner' };
}

interface ErrorBody {
  error?: unknown;
  code?: unknown;
  limit?: unknown;
}

function readBody(err: HttpErrorResponse): ErrorBody | undefined {
  if (!err.error || typeof err.error !== 'object') return undefined;
  return err.error as ErrorBody;
}