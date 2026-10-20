import { describe, expect, test } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { PedalCatalogApi } from './pedal-catalog-api.service';
import { environment } from '../../environments/environment';

// F36 R6 / R9 / R11 — `PedalCatalogApi` exposes exactly the four listed
// methods and uses the correct HTTP verbs, URLs, and bodies. The body
// shape on attach is verified by deep equality; the path id is encoded
// with `encodeURIComponent` (shared with `SongsApi`).
describe('PedalCatalogApi (F36 R6, R9, R11)', () => {
  test('listPedals → GET /pedals', async () => {
    const httpMock = setupApi();
    const api = TestBed.inject(PedalCatalogApi);
    const promise = api.listPedals();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/pedals`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'p1',
        name: 'Lead boost',
        createdBy: null,
        createdAt: '2026-10-18T00:00:00Z',
        updatedAt: '2026-10-18T00:00:00Z',
      },
    ]);
    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('p1');
    httpMock.verify();
  });

  test('listSongPedals encodes the song id and targets GET /songs/:id/pedals', async () => {
    const httpMock = setupApi();
    const api = TestBed.inject(PedalCatalogApi);
    const promise = api.listSongPedals('s/1');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/s%2F1/pedals`,
    );
    expect(req.request.method).toBe('GET');
    req.flush([]);
    await promise;
    httpMock.verify();
  });

  test('attachPedal sends POST /songs/:id/pedals with the exact body shape', async () => {
    const httpMock = setupApi();
    const api = TestBed.inject(PedalCatalogApi);
    const promise = api.attachPedal('s1', 'p1', 'Lead');
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      pedal_catalog_id: 'p1',
      label: 'Lead',
      config: {},
    });
    req.flush({
      id: 'c1',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    const result = await promise;
    expect(result.id).toBe('c1');
    expect(result.label).toBe('Lead');
    httpMock.verify();
  });

  test('attachPedal preserves a multi-word label and trims nothing (caller trims)', async () => {
    const httpMock = setupApi();
    const api = TestBed.inject(PedalCatalogApi);
    const promise = api.attachPedal('s1', 'p1', 'Lead boost');
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`);
    expect(req.request.body).toEqual({
      pedal_catalog_id: 'p1',
      label: 'Lead boost',
      config: {},
    });
    req.flush({
      id: 'c1',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead boost',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await promise;
    httpMock.verify();
  });

  test('detachPedal sends DELETE /songs/:id/pedals/:configId and resolves on 204', async () => {
    const httpMock = setupApi();
    const api = TestBed.inject(PedalCatalogApi);
    const promise = api.detachPedal('s1', 'c1');
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/s1/pedals/c1`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;
    httpMock.verify();
  });

  test('R11 b — the service exposes exactly listPedals, listSongPedals, attachPedal, detachPedal', () => {
    const proto = Object.getOwnPropertyNames(PedalCatalogApi.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(proto.sort()).toEqual(
      ['attachPedal', 'detachPedal', 'listPedals', 'listSongPedals'].sort(),
    );
  });
});

function setupApi(): HttpTestingController {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}