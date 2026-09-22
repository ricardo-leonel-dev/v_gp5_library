import { describe, expect, test, vi, afterEach } from 'vitest';
import { WebMidiPedalConnection } from './web-midi-pedal-connection';

type FakePort = MIDIInput & { state: 'connected' | 'disconnected'; onstatechange: ((ev: Event) => void) | null };

function fakePort(name: string | null): FakePort {
  const port = { name, state: 'connected' as const, onstatechange: null };
  return port as unknown as FakePort;
}

interface AccessLike {
  inputs: ReadonlyMap<string, FakePort>;
  outputs: ReadonlyMap<string, FakePort>;
}

function fakeAccess(inputs: Array<{ name: string | null }>, outputs: Array<{ name: string | null }>): AccessLike {
  return {
    inputs: new Map(inputs.map((p, i) => [String(i), fakePort(p.name)])),
    outputs: new Map(outputs.map((p, i) => [String(i), fakePort(p.name)])),
  };
}

interface DeferredAccess {
  promise: Promise<AccessLike>;
  resolve: (access: AccessLike) => void;
  reject: (error: Error) => void;
}

function deferredAccess(): DeferredAccess {
  let resolve!: (access: AccessLike) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AccessLike>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stubRequestMidiAccess(implementation: (options?: MIDIOptions) => Promise<AccessLike>): ReturnType<typeof vi.fn> {
  const requestMIDIAccess = vi.fn(implementation);
  vi.stubGlobal('navigator', { requestMIDIAccess });
  return requestMIDIAccess;
}

describe('WebMidiPedalConnection.isSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('returns true when the browser exposes navigator.requestMIDIAccess', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() });

    const connection = new WebMidiPedalConnection();

    expect(connection.isSupported()).toBe(true);
  });

  test('returns false on browsers without Web MIDI (e.g. Safari)', () => {
    vi.stubGlobal('navigator', {});

    const connection = new WebMidiPedalConnection();

    expect(connection.isSupported()).toBe(false);
  });
});

describe('WebMidiPedalConnection.connect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('initial state is "not-connected" before connect() is called (R1)', () => {
    const connection = new WebMidiPedalConnection();

    expect(connection.connectionState()).toBe('not-connected');
  });

  test('connectionState signal value is one of the four documented states (R10)', () => {
    const connection = new WebMidiPedalConnection();

    const value = connection.connectionState();
    expect(['not-connected', 'connecting', 'connected', 'error']).toContain(value);
  });

  test('rejects without calling requestMIDIAccess when Web MIDI is unsupported (R2)', async () => {
    vi.stubGlobal('navigator', {});
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).rejects.toThrow('unsupported');
    expect(connection.connectionState()).toBe('not-connected');
  });

  test('set state to "connecting" and passes { sysex: true } to requestMIDIAccess (R3, R4)', async () => {
    const deferred = deferredAccess();
    const requestMIDIAccess = stubRequestMidiAccess(() => deferred.promise);
    const connection = new WebMidiPedalConnection();

    const pending = connection.connect();
    expect(connection.connectionState()).toBe('connecting');
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: true });

    deferred.resolve(
      fakeAccess(
        [{ name: 'Valeton GP-5' }],
        [{ name: 'Valeton GP-5' }],
      ),
    );
    await pending;

    expect(connection.connectionState()).toBe('connected');
  });

  test('set state to "error" and rejects with "midi_access_denied" when requestMIDIAccess rejects (R8)', async () => {
    stubRequestMidiAccess(() => Promise.reject(new Error('permission denied')));
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).rejects.toThrow('midi_access_denied');
    expect(connection.connectionState()).toBe('error');
  });

  test('matches input case-insensitively (R5) — "gp5", "GP-5", and "gp 5" all match', async () => {
    stubRequestMidiAccess(() =>
      Promise.resolve(
        fakeAccess(
          [{ name: 'GP5 MIDI IN' }],
          [{ name: 'gp 5 midi out' }],
        ),
      ),
    );
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).resolves.toBeUndefined();
    expect(connection.connectionState()).toBe('connected');
  });

  test('set state to "error" and rejects with "gp5_not_found" when only the output matches (R7)', async () => {
    stubRequestMidiAccess(() =>
      Promise.resolve(
        fakeAccess(
          [{ name: 'Some Other Device' }],
          [{ name: 'Valeton GP-5' }],
        ),
      ),
    );
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).rejects.toThrow('gp5_not_found');
    expect(connection.connectionState()).toBe('error');
  });

  test('set state to "error" when neither matching input nor output (R7)', async () => {
    stubRequestMidiAccess(() => Promise.resolve(fakeAccess([], [])));
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).rejects.toThrow('gp5_not_found');
    expect(connection.connectionState()).toBe('error');
  });

  test('resolves and set state to "connected" when both an input and an output match (R6)', async () => {
    stubRequestMidiAccess(() =>
      Promise.resolve(
        fakeAccess(
          [{ name: 'Valeton GP-5' }],
          [{ name: 'Valeton GP-5' }],
        ),
      ),
    );
    const connection = new WebMidiPedalConnection();

    await expect(connection.connect()).resolves.toBeUndefined();
    expect(connection.connectionState()).toBe('connected');
  });

  test('falls back to "not-connected" when a stored port onstatechange fires with state "disconnected" (R9)', async () => {
    const access = fakeAccess(
      [{ name: 'Valeton GP-5' }],
      [{ name: 'Valeton GP-5' }],
    );
    stubRequestMidiAccess(() => Promise.resolve(access));
    const connection = new WebMidiPedalConnection();

    await connection.connect();
    expect(connection.connectionState()).toBe('connected');

    const outputPort = [...access.outputs.values()][0];
    outputPort.state = 'disconnected';
    outputPort.onstatechange?.(new Event('statechange'));

    expect(connection.connectionState()).toBe('not-connected');
  });
});
