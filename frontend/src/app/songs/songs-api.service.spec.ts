import { describe, expect, test, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SongsApi } from './songs-api.service';
import { environment } from '../../environments/environment';

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