import { describe, expect, test, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SongsApi } from './songs-api.service';
import { environment } from '../../environments/environment';
import { GP5_CAPTURED_BODIES, capturedBodyBytes } from '../midi/gp5-captured-bodies.fixture';
import { encodePrstFile } from '../midi/gp5-prst-file';
import { decodeGp5Body, NAME_LEN } from '../midi/gp5-sysex-preset-codec';
import type { Preset } from '../midi/preset';

describe('SongsApi.createSong (R77, R91, T17)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  test('sends one POST to /songs with FormData, no Content-Type header, resolves the 201 body', async () => {
    const form = new FormData();
    form.append('name', 'My Song');
    const pending = api.createSong(form);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush({ id: 'song-1', name: 'My Song' });
    await expect(pending).resolves.toEqual({ id: 'song-1', name: 'My Song' });
    httpMock.verify();
  });
});

describe('SongsApi.getSongPreset (R6, R9-R12, T9, T10)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  // Build a real 507-byte .prst so the success case is realistic.
  function buildPrst(): Uint8Array {
    const body = capturedBodyBytes(0);
    const nameField = new Uint8Array(NAME_LEN);
    const enc = new TextEncoder().encode('TL DLX AMP');
    for (let i = 0; i < NAME_LEN; i++) nameField[i] = i < enc.length ? enc[i] : 0;
    const chain = decodeGp5Body(body, 'TL DLX AMP', 0).chain;
    const preset: Preset = {
      slot: 0,
      name: 'TL DLX AMP',
      chain,
      raw: { body, nameField },
    };
    return encodePrstFile(preset);
  }

  test('GET /songs/:id/files/preset?sort_order=N with responseType blob resolves a 507-byte Uint8Array (R6, R10)', async () => {
    const bytes = buildPrst();
    const pending = api.getSongPreset('song-7', 0);
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song-7/files/preset?sort_order=0`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    // Simulate a 200 + a Blob of the right size.
    req.flush(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const resolved = await pending;
    expect(resolved).toBeInstanceOf(Uint8Array);
    expect(resolved.length).toBe(507);
    expect(resolved).toEqual(bytes);
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 404 (R9)', async () => {
    const pending = api.getSongPreset('missing', 0);
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/missing/files/preset?sort_order=0`,
    );
    req.flush(new Blob(['not found'], { type: 'text/plain' }), {
      status: 404,
      statusText: 'Not Found',
    });
    await expect(pending).rejects.toMatchObject({ status: 404 });
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 401 (R10)', async () => {
    const pending = api.getSongPreset('s', 0);
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/s/files/preset?sort_order=0`,
    );
    req.flush(new Blob(['unauthorized'], { type: 'text/plain' }), {
      status: 401,
      statusText: 'Unauthorized',
    });
    await expect(pending).rejects.toMatchObject({ status: 401 });
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 0 (network, R11)', async () => {
    const pending = api.getSongPreset('s', 0);
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/s/files/preset?sort_order=0`,
    );
    req.error(new ProgressEvent('error'));
    await expect(pending).rejects.toMatchObject({ status: 0 });
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 500 (R12)', async () => {
    const pending = api.getSongPreset('s', 0);
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/s/files/preset?sort_order=0`,
    );
    req.flush(new Blob(['boom'], { type: 'text/plain' }), {
      status: 500,
      statusText: 'Server Error',
    });
    await expect(pending).rejects.toMatchObject({ status: 500 });
    httpMock.verify();
  });
});
