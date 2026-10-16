import { describe, expect, test } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { mapSaveSongError } from './save-song-errors';

function makeHttpError(status: number, body: unknown | null): HttpErrorResponse {
  const error = body === null ? new ErrorEvent('network') : body;
  return new HttpErrorResponse({ status, statusText: 'X', error });
}

describe('mapSaveSongError (T29)', () => {
  test('400 "name is required" → nameRequired, place name', () => {
    expect(mapSaveSongError(makeHttpError(400, { error: 'name is required' }))).toEqual({
      key: 'saveSong.errors.nameRequired',
      place: 'name',
    });
  });

  test('400 "at least one preset file is required" → presetMissing, banner (R98)', () => {
    expect(mapSaveSongError(makeHttpError(400, { error: 'at least one preset file is required' }))).toEqual({
      key: 'saveSong.errors.presetMissing',
      place: 'banner',
    });
  });

  test('400 "at most one cover file is allowed" → coverTooMany, banner', () => {
    expect(mapSaveSongError(makeHttpError(400, { error: 'at most one cover file is allowed' }))).toEqual({
      key: 'saveSong.errors.coverTooMany',
      place: 'banner',
    });
  });

  test('400 "extra_config exceeds maximum size of 32768 bytes" → extraConfigTooLarge, extraConfig', () => {
    expect(
      mapSaveSongError(
        makeHttpError(400, { error: 'extra_config exceeds maximum size of 32768 bytes' }),
      ),
    ).toEqual({ key: 'saveSong.errors.extraConfigTooLarge', place: 'extraConfig' });
  });

  test('400 "extra_config must be valid JSON" → extraConfigInvalid, extraConfig', () => {
    expect(
      mapSaveSongError(makeHttpError(400, { error: 'extra_config must be valid JSON' })),
    ).toEqual({ key: 'saveSong.errors.extraConfigInvalid', place: 'extraConfig' });
  });

  test('400 "extra_config must be a JSON object" → extraConfigInvalid, extraConfig', () => {
    expect(
      mapSaveSongError(makeHttpError(400, { error: 'extra_config must be a JSON object' })),
    ).toEqual({ key: 'saveSong.errors.extraConfigInvalid', place: 'extraConfig' });
  });

  test('400 "preset file at position 0 has no readable GP-5 preset name" → presetNameUnreadable position 1 (R108)', () => {
    expect(
      mapSaveSongError(
        makeHttpError(400, {
          error: 'preset file at position 0 has no readable GP-5 preset name',
        }),
      ),
    ).toEqual({
      key: 'saveSong.errors.presetNameUnreadable',
      place: 'banner',
      params: { position: 1 },
    });
  });

  test('400 "preset file at position 2 has no readable GP-5 preset name" → presetNameUnreadable position 3', () => {
    expect(
      mapSaveSongError(
        makeHttpError(400, {
          error: 'preset file at position 2 has no readable GP-5 preset name',
        }),
      ),
    ).toEqual({
      key: 'saveSong.errors.presetNameUnreadable',
      place: 'banner',
      params: { position: 3 },
    });
  });

  test('400 obsolete "exactly one preset file is required" → unexpected', () => {
    expect(
      mapSaveSongError(makeHttpError(400, { error: 'exactly one preset file is required' })),
    ).toEqual({ key: 'saveSong.errors.unexpected', place: 'banner' });
  });

  test('402 plan_song_limit limit: 1 → planSongLimit, banner (R99)', () => {
    expect(
      mapSaveSongError(makeHttpError(402, { code: 'plan_song_limit', limit: 1, error: 'x' })),
    ).toEqual({
      key: 'saveSong.errors.planSongLimit',
      place: 'banner',
      params: { limit: 1 },
    });
  });

  test('402 plan_preset_limit limit: 2 → planPresetLimit, banner (R100)', () => {
    expect(
      mapSaveSongError(makeHttpError(402, { code: 'plan_preset_limit', limit: 2, error: 'x' })),
    ).toEqual({
      key: 'saveSong.errors.planPresetLimit',
      place: 'banner',
      params: { limit: 2 },
    });
  });

  test('402 known code but no numeric limit → planLimitGeneric', () => {
    expect(
      mapSaveSongError(makeHttpError(402, { code: 'plan_song_limit', error: 'x' })),
    ).toEqual({ key: 'saveSong.errors.planLimitGeneric', place: 'banner' });
  });

  test('402 unknown code → planLimitGeneric', () => {
    expect(
      mapSaveSongError(makeHttpError(402, { code: 'some_other_code', limit: 5 })),
    ).toEqual({ key: 'saveSong.errors.planLimitGeneric', place: 'banner' });
  });

  test('402 with text/plain body → planLimitGeneric', () => {
    expect(mapSaveSongError(makeHttpError(402, 'plain text body'))).toEqual({
      key: 'saveSong.errors.planLimitGeneric',
      place: 'banner',
    });
  });

  test('401 → sessionExpired with loginLink (R102)', () => {
    expect(mapSaveSongError(makeHttpError(401, { error: 'unauthorized' }))).toEqual({
      key: 'saveSong.errors.sessionExpired',
      place: 'banner',
      loginLink: true,
    });
  });

  test('404 user not found → sessionExpired with loginLink (R102)', () => {
    expect(mapSaveSongError(makeHttpError(404, { error: 'user not found' }))).toEqual({
      key: 'saveSong.errors.sessionExpired',
      place: 'banner',
      loginLink: true,
    });
  });

  test('status 0 → network', () => {
    expect(mapSaveSongError(makeHttpError(0, null))).toEqual({
      key: 'saveSong.errors.network',
      place: 'banner',
    });
  });

  test('text/plain 500 → unexpected', () => {
    expect(mapSaveSongError(makeHttpError(500, 'server exploded'))).toEqual({
      key: 'saveSong.errors.unexpected',
      place: 'banner',
    });
  });

  test('unlisted 400 → unexpected', () => {
    expect(mapSaveSongError(makeHttpError(400, { error: 'something else' }))).toEqual({
      key: 'saveSong.errors.unexpected',
      place: 'banner',
    });
  });

  test('plain Error → unexpected', () => {
    expect(mapSaveSongError(new Error('boom'))).toEqual({
      key: 'saveSong.errors.unexpected',
      place: 'banner',
    });
  });
});