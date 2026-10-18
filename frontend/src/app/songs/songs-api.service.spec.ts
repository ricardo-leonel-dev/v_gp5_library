import { describe, expect, test, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SongsApi } from './songs-api.service';
import { environment } from '../../environments/environment';
import { capturedBodyBytes } from '../midi/gp5-captured-bodies.fixture';
import { encodePrstFile } from '../midi/gp5-prst-file';
import { decodeGp5Body, NAME_LEN } from '../midi/gp5-sysex-preset-codec';
import type { Preset } from '../midi/preset';
import type { Song, SongDetail } from './song';

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

describe('SongsApi.listSongs (F26 R2)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  test('GET /songs resolves the bare array body', async () => {
    const songs: Song[] = [
      { id: 'song-7', name: 'Lead Tones', presets: [] },
      { id: 'song-9', name: 'Ambient', artist: 'Radiohead', presets: [] },
    ];
    const pending = api.listSongs();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    expect(req.request.method).toBe('GET');
    req.flush(songs);
    await expect(pending).resolves.toEqual(songs);
    httpMock.verify();
  });

  test('rejects on status 500', async () => {
    const pending = api.listSongs();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    await expect(pending).rejects.toMatchObject({ status: 500 });
    httpMock.verify();
  });
});

describe('SongsApi.getSong (F26 R27)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  test('GET /songs/:id with URL-encoded id resolves the SongDetail body', async () => {
    const detail: SongDetail = {
      id: 'song with spaces',
      name: 'My Tunes',
      artist: 'Q',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'A' },
        { id: 'p1', sortOrder: 1, name: 'B' },
      ],
      files: [
        {
          id: 'f1',
          kind: 'cover',
          originalFilename: 'cover.png',
          mimeType: 'image/png',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    };
    const pending = api.getSong('song with spaces');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song%20with%20spaces`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(detail);
    await expect(pending).resolves.toEqual(detail);
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 404', async () => {
    const pending = api.getSong('missing');
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs/missing`);
    req.flush('not found', { status: 404, statusText: 'Not Found' });
    await expect(pending).rejects.toMatchObject({ status: 404 });
    httpMock.verify();
  });
});

describe('SongsApi.getCover (F26 R13, R35)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  test('GET /songs/:id/files/cover with responseType blob resolves a Blob', async () => {
    const coverBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const pending = api.getCover('song-7');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song-7/files/cover`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([coverBytes as BlobPart], { type: 'image/png' }));
    const resolved = await pending;
    expect(resolved).toBeInstanceOf(Blob);
    httpMock.verify();
  });

  test('rejects with HttpErrorResponse 404 (no cover)', async () => {
    const pending = api.getCover('no-cover-song');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/no-cover-song/files/cover`,
    );
    req.flush(new Blob(['not found'], { type: 'text/plain' }), {
      status: 404,
      statusText: 'Not Found',
    });
    await expect(pending).rejects.toMatchObject({ status: 404 });
    httpMock.verify();
  });

  test('URL-encodes the song id', async () => {
    const pending = api.getCover('song/with/slashes');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song%2Fwith%2Fslashes/files/cover`,
    );
    req.flush(new Blob([new Uint8Array([0]) as BlobPart], { type: 'image/png' }));
    await pending;
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

describe('SongsApi.addSongPreset (F31 R3)', () => {
  let api: SongsApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SongsApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SongsApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

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

  test('POST /songs/:id/presets with a single 507-byte "preset" File named as passed; resolves the SongPreset body', async () => {
    const bytes = buildPrst();
    const filename = 'LEAD 2.prst';
    const pending = api.addSongPreset('song-7', bytes, filename);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7/presets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect(req.request.headers.has('Content-Type')).toBe(false);
    const form = req.request.body as FormData;
    const entries = Array.from(form.entries());
    const presetEntries = entries.filter(([k]) => k === 'preset');
    expect(presetEntries.length).toBe(1);
    const file = presetEntries[0]![1] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(filename);
    expect(file.size).toBe(507);
    expect(file.type).toBe('application/octet-stream');
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    expect(fileBytes.length).toBe(507);
    expect(fileBytes).toEqual(bytes);
    const responseBody = {
      id: 'preset-1',
      sortOrder: 1,
      name: 'LEAD 2',
      originalFilename: filename,
      mimeType: 'application/octet-stream',
      byteSize: 507,
      createdAt: '2026-10-18T00:00:00Z',
    };
    req.flush(responseBody);
    await expect(pending).resolves.toEqual(responseBody);
    httpMock.verify();
  });

  test('URL-encodes the song id', async () => {
    const bytes = buildPrst();
    const pending = api.addSongPreset('song/with/slashes', bytes, 'X.prst');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song%2Fwith%2Fslashes/presets`,
    );
    req.flush({
      id: 'preset-2',
      sortOrder: 0,
      name: 'X',
    });
    await pending;
    httpMock.verify();
  });
});
