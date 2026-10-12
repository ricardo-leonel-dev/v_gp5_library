import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { PedalConnectFlow } from './pedal-connect-flow.service';
import { PedalPresetsStore } from './pedal-presets.store';
import { WebMidiPedalConnection } from '../midi/web-midi-pedal-connection';
import type { PedalConnectionState } from '../midi/pedal-connection';

class FakePedal {
  private readonly stateSignal = signal<PedalConnectionState>('not-connected');
  readonly connectionState = this.stateSignal.asReadonly();
  isSupportedResult = true;
  readonly connect = vi.fn<(this: FakePedal) => Promise<void>>();
  setState(next: PedalConnectionState): void {
    this.stateSignal.set(next);
  }
  isSupported(): boolean {
    return this.isSupportedResult;
  }
}

class FakeStore {
  readonly read = vi.fn<(this: FakeStore) => Promise<void>>();
}

const routerSpy = { navigateByUrl: vi.fn().mockResolvedValue(true) };

function setup(opts: { isSupported?: boolean } = {}): {
  fake: FakePedal;
  store: FakeStore;
  flow: PedalConnectFlow;
  httpMock: HttpTestingController;
} {
  const fake = new FakePedal();
  fake.isSupportedResult = opts.isSupported ?? true;
  const store = new FakeStore();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: WebMidiPedalConnection, useValue: fake },
      { provide: PedalPresetsStore, useValue: store },
      { provide: Router, useValue: routerSpy },
    ],
  });
  routerSpy.navigateByUrl.mockClear();
  fake.connect.mockReset();
  store.read.mockReset();
  return {
    fake,
    store,
    flow: TestBed.inject(PedalConnectFlow),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('PedalConnectFlow (R50-R54, R63-R65)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    routerSpy.navigateByUrl.mockClear();
  });

  test('not-connected path: connect() once, then navigateByUrl, then store.read() (R50, R51, R65)', async () => {
    const { fake, store, flow } = setup();
    fake.connect.mockResolvedValueOnce(undefined);
    await flow.start();
    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/pedal/presets');
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  test('connected path: navigateByUrl and store.read(), connect() NOT called (R52, R64)', async () => {
    const { fake, store, flow } = setup();
    fake.setState('connected');
    await flow.start();
    expect(fake.connect).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/pedal/presets');
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  test('R53 — connect() rejecting with midi_access_denied → error key, no navigation', async () => {
    const { fake, store, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('midi_access_denied'));
    await flow.start();
    expect(flow.error()).toBe('midi_access_denied');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  test('R53 — connect() rejecting with gp5_not_found → error key, no navigation', async () => {
    const { fake, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('gp5_not_found'));
    await flow.start();
    expect(flow.error()).toBe('gp5_not_found');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  test('R53 — connect() rejecting with unsupported → error key, no navigation', async () => {
    const { fake, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('unsupported'));
    await flow.start();
    expect(flow.error()).toBe('unsupported');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  test('R53 — connect() rejecting with an unknown message → error key "unknown"', async () => {
    const { fake, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('boom'));
    await flow.start();
    expect(flow.error()).toBe('unknown');
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
  });

  test('R54 — dismissError() clears the error signal', async () => {
    const { fake, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('midi_access_denied'));
    await flow.start();
    expect(flow.error()).toBe('midi_access_denied');
    flow.dismissError();
    expect(flow.error()).toBeNull();
  });

  test('R54 — start() after an error clears it (before attempting the next connect)', async () => {
    const { fake, flow } = setup();
    fake.connect.mockRejectedValueOnce(new Error('midi_access_denied'));
    await flow.start();
    expect(flow.error()).toBe('midi_access_denied');
    fake.connect.mockResolvedValueOnce(undefined);
    await flow.start();
    expect(flow.error()).toBeNull();
  });

  test('R49 — when not supported, start() is a no-op (no connect, no nav, no read)', async () => {
    const { fake, store, flow } = setup({ isSupported: false });
    await flow.start();
    expect(fake.connect).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  test('connecting state — start() is a no-op', async () => {
    const { fake, store, flow } = setup();
    fake.setState('connecting');
    await flow.start();
    expect(fake.connect).not.toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).not.toHaveBeenCalled();
    expect(store.read).not.toHaveBeenCalled();
  });

  test('R56 — no HTTP request after resolve or reject (HttpTestingController.verify)', async () => {
    const { fake, httpMock } = setup();
    fake.connect.mockResolvedValueOnce(undefined);
    await new Promise((r) => setTimeout(r, 0));
    httpMock.verify();
    fake.connect.mockRejectedValueOnce(new Error('boom'));
    await new Promise((r) => setTimeout(r, 0));
    httpMock.verify();
  });
});