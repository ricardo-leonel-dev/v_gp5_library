import { describe, expect, test } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { classifyLoadError } from './library-load-error';

describe('classifyLoadError (F26 R20, R21, R24, R37-R39, R41)', () => {
  test('HttpErrorResponse status 0 → unreachable (R20, R38)', () => {
    const err = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' });
    expect(classifyLoadError(err)).toBe('unreachable');
  });

  test('HttpErrorResponse status 401 → session_expired (R24, R41)', () => {
    const err = new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' });
    expect(classifyLoadError(err)).toBe('session_expired');
  });

  test('HttpErrorResponse status 404 → not_found (R37)', () => {
    const err = new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
    expect(classifyLoadError(err)).toBe('not_found');
  });

  test('HttpErrorResponse status 500 → load_failed (R21, R39)', () => {
    const err = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
    expect(classifyLoadError(err)).toBe('load_failed');
  });

  test('non-HTTP error → load_failed', () => {
    expect(classifyLoadError(new Error('boom'))).toBe('load_failed');
  });

  test('plain string thrown → load_failed', () => {
    expect(classifyLoadError('nope')).toBe('load_failed');
  });
});