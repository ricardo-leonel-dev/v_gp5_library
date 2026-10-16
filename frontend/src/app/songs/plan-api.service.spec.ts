import { describe, expect, test, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PlanApi } from './plan-api.service';
import { environment } from '../../environments/environment';

describe('PlanApi.getMyPlan (R53, R59, T19)', () => {
  let api: PlanApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PlanApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PlanApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  function flushPlan(body: unknown): void {
    httpMock
      .expectOne(`${environment.apiBaseUrl}/me/plan`)
      .flush(body as object);
  }

  test('free plan maps nested wire shape to the flat internal limits', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', limits: { songs: 1, presetsPerSong: 1 }, usage: { songs: 0 } });
    await expect(pending).resolves.toEqual({
      plan: 'free',
      songLimit: 1,
      presetsPerSongLimit: 1,
      songCount: 0,
    });
  });

  test('premium plan returns null both limits and the song count (Rev 5 nested shape)', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'premium', limits: { songs: null, presetsPerSong: null }, usage: { songs: 7 } });
    await expect(pending).resolves.toEqual({
      plan: 'premium',
      songLimit: null,
      presetsPerSongLimit: null,
      songCount: 7,
    });
  });

  test('extra top-level and nested fields are ignored', async () => {
    const pending = api.getMyPlan();
    flushPlan({
      plan: 'basic',
      limits: { songs: 2, presetsPerSong: 2, extraNested: 999 },
      usage: { songs: 1 },
      extraTopLevel: 7,
    });
    await expect(pending).resolves.toEqual({
      plan: 'basic',
      songLimit: 2,
      presetsPerSongLimit: 2,
      songCount: 1,
    });
  });

  test('returns null for a missing limits object', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', usage: { songs: 0 } });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for a missing usage object', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', limits: { songs: 1, presetsPerSong: 1 } });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for a missing nested field (limits.presetsPerSong)', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', limits: { songs: 1 }, usage: { songs: 0 } });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for a string limit (limits.songs is "1")', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', limits: { songs: '1', presetsPerSong: 1 }, usage: { songs: 0 } });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for a negative usage.songs', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', limits: { songs: 1, presetsPerSong: 1 }, usage: { songs: -1 } });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for the old flat Rev 4 shape', async () => {
    const pending = api.getMyPlan();
    flushPlan({ plan: 'free', songLimit: 1, presetsPerSongLimit: 1, songCount: 0 });
    await expect(pending).resolves.toBeNull();
  });

  test('returns null for a non-object body', async () => {
    const pending = api.getMyPlan();
    flushPlan('plain string');
    await expect(pending).resolves.toBeNull();
  });

  test('rejects on HTTP 500', async () => {
    const pending = api.getMyPlan();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await expect(pending).rejects.toBeDefined();
  });
});