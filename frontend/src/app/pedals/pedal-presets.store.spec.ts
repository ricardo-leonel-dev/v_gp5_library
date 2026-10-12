import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { PedalPresetsStore } from './pedal-presets.store';
import { WebMidiPedalConnection } from '../midi/web-midi-pedal-connection';
import type { Preset } from '../midi/preset';
import type { PedalConnectionState } from '../midi/pedal-connection';

class FakePedal {
  private readonly stateSignal = signal<PedalConnectionState>('connected');
  readonly connectionState = this.stateSignal.asReadonly();
  readPresets = vi.fn<(this: FakePedal) => Promise<Preset[]>>();
  setConnectionState(next: PedalConnectionState): void {
    this.stateSignal.set(next);
  }
}

function rawPreset(slot: number, name: string): Preset {
  return {
    slot,
    name,
    chain: [],
    raw: { body: new Uint8Array(466), nameField: new Uint8Array(16) },
  };
}

function setup(): { httpMock: HttpTestingController; fake: FakePedal; store: PedalPresetsStore } {
  const fake = new FakePedal();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: WebMidiPedalConnection, useValue: fake },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const store = TestBed.inject(PedalPresetsStore);
  return { httpMock, fake, store };
}

describe('PedalPresetsStore.read (R55, R56, R63, R64, R65, R66)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  test('two overlapping read() calls produce a single readPresets() call', async () => {
    const { fake, store } = setup();
    let resolve: (p: Preset[]) => void = () => {};
    fake.readPresets.mockReturnValueOnce(
      new Promise<Preset[]>((res) => {
        resolve = res;
      }),
    );
    const p1 = store.read();
    const p2 = store.read();
    expect(fake.readPresets).toHaveBeenCalledTimes(1);
    resolve([rawPreset(0, 'A')]);
    await Promise.all([p1, p2]);
    expect(store.loadState()).toBe('loaded');
    expect(store.presets()).toEqual([rawPreset(0, 'A')]);
  });

  test('a read() after the first resolves triggers a second readPresets()', async () => {
    const { fake, store } = setup();
    fake.readPresets
      .mockResolvedValueOnce([rawPreset(0, 'A')])
      .mockResolvedValueOnce([rawPreset(1, 'B')]);
    await store.read();
    expect(store.presets()).toEqual([rawPreset(0, 'A')]);
    await store.read();
    expect(fake.readPresets).toHaveBeenCalledTimes(2);
    expect(store.presets()).toEqual([rawPreset(1, 'B')]);
  });

  test('readPresets rejecting with not_connected maps error to not_connected_error', async () => {
    const { fake, store } = setup();
    fake.readPresets.mockRejectedValueOnce(new Error('not_connected'));
    await store.read();
    expect(store.loadState()).toBe('error');
    expect(store.error()).toBe('not_connected_error');
  });

  test('readPresets rejecting with request_in_progress surfaces the raw message', async () => {
    const { fake, store } = setup();
    fake.readPresets.mockRejectedValueOnce(new Error('request_in_progress'));
    await store.read();
    expect(store.error()).toBe('request_in_progress');
  });

  test('after a successful read, loadState is loaded, presets hold the result, error is null', async () => {
    const { fake, store } = setup();
    fake.readPresets.mockResolvedValueOnce([rawPreset(7, 'X')]);
    await store.read();
    expect(store.loadState()).toBe('loaded');
    expect(store.error()).toBeNull();
    expect(store.presets().map((p) => p.slot)).toEqual([7]);
  });
});

describe('PedalPresetsStore.savableSnapshot (R60, R68, R69)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  test('returns [] when the pedal is not connected', () => {
    const { fake, store } = setup();
    fake.setConnectionState('not-connected');
    expect(store.savableSnapshot()).toEqual([]);
  });

  test('returns [] when no read has happened yet', () => {
    const { fake, store } = setup();
    fake.setConnectionState('connected');
    expect(store.savableSnapshot()).toEqual([]);
  });

  test('returns savable presets sorted by slot when connected and a read has loaded', async () => {
    const { fake, store } = setup();
    fake.setConnectionState('connected');
    fake.readPresets.mockResolvedValueOnce([
      rawPreset(12, 'X'),
      rawPreset(3, 'Y'),
      { slot: 4, name: 'no-bytes', chain: [] }, // excluded (no `raw`)
    ]);
    await store.read();
    const snap = store.savableSnapshot();
    expect(snap.map((p) => p.slot)).toEqual([3, 12]);
  });

  test('returns a new array instance every call (R71)', async () => {
    const { fake, store } = setup();
    fake.readPresets.mockResolvedValueOnce([rawPreset(0, 'A')]);
    await store.read();
    const a = store.savableSnapshot();
    const b = store.savableSnapshot();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  test('never includes mock presets (no raw bytes)', async () => {
    const { fake, store } = setup();
    fake.readPresets.mockResolvedValueOnce([{ slot: 99, name: 'mock', chain: [] }]);
    await store.read();
    expect(store.savableSnapshot()).toEqual([]);
  });
});

describe('PedalPresetsStore HTTP isolation', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  test('after read() resolves, httpMock.verify() shows no HTTP request (R56)', async () => {
    const { fake, store, httpMock } = setup();
    fake.readPresets.mockResolvedValueOnce([rawPreset(0, 'A')]);
    await store.read();
    httpMock.verify();
  });
});