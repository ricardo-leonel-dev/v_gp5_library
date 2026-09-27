import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WebMidiPedalConnection, READ_TIMEOUT_MS } from './web-midi-pedal-connection';
import { SYSEX_PRESET_CODEC, type SysexPresetCodec, type SysexDecodeResult } from './sysex-preset-codec';
import type { Preset } from './preset';

interface FakePort {
  name: string | null;
  state: 'connected' | 'disconnected';
  onstatechange: ((ev: Event) => void) | null;
  onmidimessage: ((ev: MIDIMessageEvent) => void) | null;
}

interface FakeOutput extends FakePort {
  __sendSpy: ReturnType<typeof vi.fn>;
  send(data: number[] | Uint8Array, timestamp?: number): void;
}

function fakePort(name: string | null): FakePort {
  return {
    name,
    state: 'connected',
    onstatechange: null,
    onmidimessage: null,
  };
}

function fakeOutput(name: string | null): FakeOutput {
  const sendSpy = vi.fn();
  const out = fakePort(name) as FakeOutput;
  out.__sendSpy = sendSpy;
  out.send = ((...args: unknown[]) => sendSpy(...args)) as FakeOutput['send'];
  return out;
}

interface AccessLike {
  inputs: ReadonlyMap<string, FakePort>;
  outputs: ReadonlyMap<string, FakeOutput>;
}

function fakeAccess(
  inputs: Array<{ name: string | null }>,
  outputs: Array<{ name: string | null }>,
): AccessLike {
  return {
    inputs: new Map(inputs.map((p, i) => [String(i), fakePort(p.name)])),
    outputs: new Map(outputs.map((p, i) => [String(i), fakeOutput(p.name)])),
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

function stubRequestMidiAccess(
  implementation: (options?: MIDIOptions) => Promise<AccessLike>,
): ReturnType<typeof vi.fn> {
  const requestMIDIAccess = vi.fn(implementation);
  vi.stubGlobal('navigator', { requestMIDIAccess });
  return requestMIDIAccess;
}

function fixturePreset(slot: number, name = `preset${slot}`): Preset {
  return {
    slot,
    name,
    chain: Array.from({ length: 10 }, (_, i) => ({
      moduleType: `cat${i}_fx${i}`,
      enabled: true,
      parameters: {},
    })),
  };
}

class FakeCodec implements SysexPresetCodec {
  readMessageSets: Uint8Array[][] = [];
  writeMessageSets: Uint8Array[][] = [];
  decodeResults: SysexDecodeResult[] = [];
  encodeReadAllRequestCalls = 0;
  encodeWriteRequestCalls: Preset[] = [];

  encodeReadAllRequest(): Uint8Array[] {
    this.encodeReadAllRequestCalls++;
    return this.readMessageSets[this.encodeReadAllRequestCalls - 1] ?? [];
  }

  encodeWriteRequest(preset: Preset): Uint8Array[] {
    this.encodeWriteRequestCalls.push(preset);
    return this.writeMessageSets[this.encodeWriteRequestCalls.length - 1] ?? [
      new Uint8Array([0x01, 0x02, 0x03]),
    ];
  }

  decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
    return this.decodeResults.shift() ?? { kind: 'ignored' };
  }
}

interface SetupOptions {
  codec?: FakeCodec;
  access?: AccessLike;
}

function setup(options: SetupOptions = {}): {
  connection: WebMidiPedalConnection;
  codec: FakeCodec;
  access: AccessLike;
} {
  const codec = options.codec ?? new FakeCodec();
  const access = options.access ?? fakeAccess(
    [{ name: 'Valeton GP-5' }],
    [{ name: 'Valeton GP-5' }],
  );
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SYSEX_PRESET_CODEC, useValue: codec }],
  });
  const connection = TestBed.inject(WebMidiPedalConnection);
  return { connection, codec, access };
}

async function connectAndSetup(codec: FakeCodec = new FakeCodec()): Promise<{
  connection: WebMidiPedalConnection;
  codec: FakeCodec;
  access: AccessLike;
}> {
  const { connection, codec: c, access } = setup({ codec });
  stubRequestMidiAccess(() => Promise.resolve(access));
  await connection.connect();
  return { connection, codec: c, access };
}

async function fireMessages(input: FakePort, payloads: Uint8Array[]): Promise<void> {
  for (const data of payloads) {
    const ev = { data } as unknown as MIDIMessageEvent;
    input.onmidimessage?.(ev);
  }
}

beforeEach(() => {
  TestBed.resetTestingModule();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TestBed.resetTestingModule();
});

describe('WebMidiPedalConnection.isSupported', () => {
  test('returns true when the browser exposes navigator.requestMIDIAccess', () => {
    vi.stubGlobal('navigator', { requestMIDIAccess: vi.fn() });
    const { connection } = setup();

    expect(connection.isSupported()).toBe(true);
  });

  test('returns false on browsers without Web MIDI (e.g. Safari)', () => {
    vi.stubGlobal('navigator', {});
    const { connection } = setup();

    expect(connection.isSupported()).toBe(false);
  });
});

describe('WebMidiPedalConnection.connect', () => {
  test('initial state is "not-connected" before connect() is called (R1)', () => {
    const { connection } = setup();

    expect(connection.connectionState()).toBe('not-connected');
  });

  test('connectionState signal value is one of the four documented states (R10)', () => {
    const { connection } = setup();

    const value = connection.connectionState();
    expect(['not-connected', 'connecting', 'connected', 'error']).toContain(value);
  });

  test('rejects without calling requestMIDIAccess when Web MIDI is unsupported (R2)', async () => {
    vi.stubGlobal('navigator', {});
    const { connection } = setup();

    await expect(connection.connect()).rejects.toThrow('unsupported');
    expect(connection.connectionState()).toBe('not-connected');
  });

  test('set state to "connecting" and passes { sysex: true } to requestMIDIAccess (R3, R4)', async () => {
    const deferred = deferredAccess();
    const requestMIDIAccess = stubRequestMidiAccess(() => deferred.promise);
    const { connection } = setup();

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
    const { connection } = setup();

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
    const { connection } = setup();

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
    const { connection } = setup();

    await expect(connection.connect()).rejects.toThrow('gp5_not_found');
    expect(connection.connectionState()).toBe('error');
  });

  test('set state to "error" when neither matching input nor output (R7)', async () => {
    stubRequestMidiAccess(() => Promise.resolve(fakeAccess([], [])));
    const { connection } = setup();

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
    const { connection } = setup();

    await expect(connection.connect()).resolves.toBeUndefined();
    expect(connection.connectionState()).toBe('connected');
  });

  test('falls back to "not-connected" when a stored port onstatechange fires with state "disconnected" (R9)', async () => {
    const access = fakeAccess(
      [{ name: 'Valeton GP-5' }],
      [{ name: 'Valeton GP-5' }],
    );
    stubRequestMidiAccess(() => Promise.resolve(access));
    const { connection } = setup();

    await connection.connect();
    expect(connection.connectionState()).toBe('connected');

    const outputPort = [...access.outputs.values()][0];
    outputPort.state = 'disconnected';
    outputPort.onstatechange?.(new Event('statechange'));

    expect(connection.connectionState()).toBe('not-connected');
  });
});

describe('WebMidiPedalConnection.readPresets / writePreset — connection guards', () => {
  test('readPresets rejects with "not_connected" before connect() runs (R3)', async () => {
    const { connection } = setup();

    await expect(connection.readPresets()).rejects.toThrow('not_connected');
  });

  test('writePreset rejects with "not_connected" before connect() runs (R4)', async () => {
    const { connection } = setup();

    await expect(connection.writePreset(fixturePreset(0))).rejects.toThrow('not_connected');
  });

  test('readPresets rejects with "not_connected" when the connection has dropped (R3)', async () => {
    const { connection, access } = await connectAndSetup();
    const outputPort = [...access.outputs.values()][0];
    outputPort.state = 'disconnected';
    outputPort.onstatechange?.(new Event('statechange'));

    await expect(connection.readPresets()).rejects.toThrow('not_connected');
  });

  test('writePreset rejects with "not_connected" when the connection has dropped (R4)', async () => {
    const { connection, access } = await connectAndSetup();
    const outputPort = [...access.outputs.values()][0];
    outputPort.state = 'disconnected';
    outputPort.onstatechange?.(new Event('statechange'));

    await expect(connection.writePreset(fixturePreset(0))).rejects.toThrow('not_connected');
  });

  test('a second readPresets call rejects with "request_in_progress" while the first is pending (R5)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const first = connection.readPresets();
    await expect(connection.readPresets()).rejects.toThrow('request_in_progress');
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    await first;
  });

  test('writePreset rejects with "request_in_progress" while a read is pending (R5)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const first = connection.readPresets();
    await expect(connection.writePreset(fixturePreset(0))).rejects.toThrow('request_in_progress');
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    await first;
  });

  test('readPresets rejects with "request_in_progress" while a write is pending (R5)', async () => {
    const codec = new FakeCodec();
    codec.writeMessageSets = [[new Uint8Array([0x01, 0x02, 0x03])]];
    const { connection } = await connectAndSetup(codec);

    const first = connection.writePreset(fixturePreset(0));
    await expect(connection.readPresets()).rejects.toThrow('request_in_progress');
    await first;
  });
});

describe('WebMidiPedalConnection.readPresets — orchestration', () => {
  test('sends every message from encodeReadAllRequest in order via output.send (R6)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [
      [
        new Uint8Array([0x10, 0x11]),
        new Uint8Array([0x20, 0x21]),
        new Uint8Array([0x30, 0x31]),
      ],
    ];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);

    const inputPort = [...access.inputs.values()][0];
    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    await pending;

    const outputPort = [...access.outputs.values()][0];
    expect(outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array))).toEqual([
      [0x10, 0x11],
      [0x20, 0x21],
      [0x30, 0x31],
    ]);
  });

  test('accumulates presets in the order the messages decode, resolving on isLast (R7, R8)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0, 'first'), isLast: false },
      { kind: 'preset', preset: fixturePreset(1, 'second'), isLast: false },
      { kind: 'preset', preset: fixturePreset(2, 'third'), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [
      new Uint8Array([0xa1]),
      new Uint8Array([0xa2]),
      new Uint8Array([0xa3]),
    ]);

    const presets = await pending;
    expect(presets.map((p) => p.name)).toEqual(['first', 'second', 'third']);
    expect(presets.map((p) => p.slot)).toEqual([0, 1, 2]);
  });

  test('ignores "ignored" decode results without affecting the pending call (R11)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [
      { kind: 'ignored' },
      { kind: 'ignored' },
      { kind: 'preset', preset: fixturePreset(0, 'only'), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [
      new Uint8Array([0xa0]),
      new Uint8Array([0xa1]),
      new Uint8Array([0xa2]),
    ]);

    const presets = await pending;
    expect(presets).toEqual([fixturePreset(0, 'only')]);
  });

  test('rejects with "invalid_response" when a decode result is "invalid" (R10)', async () => {
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [{ kind: 'invalid', reason: 'bad crc' }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);

    await expect(pending).rejects.toThrow('invalid_response');
  });

  test('rejects with "read_timeout" when no isLast message arrives within READ_TIMEOUT_MS (R9)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01])]];
    codec.decodeResults = [{ kind: 'ignored' }];
    const { connection } = await connectAndSetup(codec);

    const pending = connection.readPresets();
    // Pre-attach a no-op handler so the timer-driven rejection (which fires
    // synchronously inside advanceTimersByTimeAsync) doesn't trip the
    // unhandled-rejection warning before expect.rejects attaches its handler.
    pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);

    await expect(pending).rejects.toThrow('read_timeout');
  });
});

describe('WebMidiPedalConnection.writePreset — orchestration', () => {
  test('sends every message from encodeWriteRequest in order via output.send (R12)', async () => {
    const codec = new FakeCodec();
    codec.writeMessageSets = [
      [
        new Uint8Array([0x11, 0x4f]),
        new Uint8Array([0x22, 0x33]),
        new Uint8Array([0x44, 0x55]),
      ],
    ];
    const { connection, access } = await connectAndSetup(codec);

    await connection.writePreset(fixturePreset(3));

    const outputPort = [...access.outputs.values()][0];
    expect(outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array))).toEqual([
      [0x11, 0x4f],
      [0x22, 0x33],
      [0x44, 0x55],
    ]);
  });

  test('resolves once all messages are sent, without waiting for an input message (R13)', async () => {
    const codec = new FakeCodec();
    codec.writeMessageSets = [[new Uint8Array([0x01, 0x02]), new Uint8Array([0x03, 0x04])]];
    const { connection } = await connectAndSetup(codec);

    const preset = fixturePreset(0);
    await expect(connection.writePreset(preset)).resolves.toBeUndefined();
    expect(codec.encodeWriteRequestCalls).toEqual([preset]);
  });
});

describe('WebMidiPedalConnection — round-trip (T20)', () => {
  test('writePreset followed by readPresets returns the same preset (T20, R6-R8, R12-R13)', async () => {
    class RoundTripCodec implements SysexPresetCodec {
      private readonly store = new Map<number, Preset>();
      private backQueue: SysexDecodeResult[] = [];

      encodeReadAllRequest(): Uint8Array[] {
        const sorted = [...this.store.entries()].sort(([a], [z]) => a - z);
        this.backQueue = sorted.map(([_, preset], i) => ({
          kind: 'preset' as const,
          preset,
          isLast: i === sorted.length - 1,
        }));
        return [new Uint8Array([0x01])];
      }

      decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
        return this.backQueue.shift() ?? { kind: 'ignored' };
      }

      encodeWriteRequest(preset: Preset): Uint8Array[] {
        this.store.set(preset.slot, preset);
        return [new Uint8Array([0x01])];
      }
    }

    const codec = new RoundTripCodec();
    const { connection, access } = await connectAndSetup(codec as unknown as FakeCodec);
    const inputPort = [...access.inputs.values()][0];

    const preset: Preset = {
      slot: 5,
      name: 'lead boost',
      chain: [
        { moduleType: 'drive', enabled: true, parameters: { gain: 0.7 } },
        { moduleType: 'delay', enabled: false, parameters: { time: 0.3 } },
      ],
    };

    await connection.writePreset(preset);

    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);

    const presets = await pending;
    expect(presets).toEqual([preset]);
  });
});
