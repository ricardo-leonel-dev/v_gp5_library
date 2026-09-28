import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  WebMidiPedalConnection,
  READ_SETTLE_MS,
  READ_STEP_TIMEOUT_MS,
} from './web-midi-pedal-connection';
import { SYSEX_PRESET_CODEC, type SysexPresetCodec, type SysexDecodeResult } from './sysex-preset-codec';
import { Gp5SysexPresetCodec } from './gp5-sysex-preset-codec';
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

// A read-all dump, from the codec's point of view, is: one names request
// message, then one body-request message per slot. FakeCodec mirrors that:
// readMessageSets[0] is [namesMessage, ...bodyMessages]. isAwaitingNames()
// starts true right after encodeReadAllRequest() and flips false once
// decodeIncomingMessage has been called `namesCompleteAfterCalls` times —
// this stands in for the real codec's names-blob-reassembly bookkeeping
// without needing to fabricate real SysEx bytes in these orchestration tests.
class FakeCodec implements SysexPresetCodec {
  readMessageSets: Uint8Array[][] = [];
  writeMessageSets: Uint8Array[][] = [];
  decodeResults: SysexDecodeResult[] = [];
  programChangeCalls: number[] = [];
  encodeReadAllRequestCalls = 0;
  encodeWriteRequestCalls: Preset[] = [];
  namesCompleteAfterCalls = 1;
  // Decode results returned while still in the names phase (isAwaitingNames()
  // true) — defaults to "ignored" (matching the real codec, which never
  // returns anything else for a names-reply frame). Kept separate from
  // decodeResults so a names-phase message can never accidentally consume a
  // body-phase result meant for a later slot.
  namesDecodeResults: SysexDecodeResult[] = [];

  private namesCallCount = 0;
  private awaitingNames = false;

  encodeReadAllRequest(): Uint8Array[] {
    this.encodeReadAllRequestCalls++;
    this.awaitingNames = true;
    this.namesCallCount = 0;
    return this.readMessageSets[this.encodeReadAllRequestCalls - 1] ?? [];
  }

  encodeProgramChange(slot: number): Uint8Array {
    this.programChangeCalls.push(slot);
    return new Uint8Array([0xc0, slot & 0x7f]);
  }

  isAwaitingNames(): boolean {
    return this.awaitingNames;
  }

  encodeWriteRequest(preset: Preset): Uint8Array[] {
    this.encodeWriteRequestCalls.push(preset);
    return this.writeMessageSets[this.encodeWriteRequestCalls.length - 1] ?? [
      new Uint8Array([0x01, 0x02, 0x03]),
    ];
  }

  decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
    if (this.awaitingNames) {
      const result = this.namesDecodeResults.shift() ?? { kind: 'ignored' };
      this.namesCallCount++;
      if (this.namesCallCount >= this.namesCompleteAfterCalls) {
        this.awaitingNames = false;
      }
      return result;
    }
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

// Drives one full read-all dump against a FakeCodec configured with a names
// message + one body-request message per fixture preset: fires the
// names-complete message, advances the settle delay + fires the body-decode
// message for each slot in turn. Assumes fake timers are active.
async function driveFullRead(
  pending: Promise<Preset[]>,
  inputPort: FakePort,
  slotCount: number,
): Promise<Preset[]> {
  await fireMessages(inputPort, [new Uint8Array([0xa0])]); // completes the names phase
  for (let slot = 0; slot < slotCount; slot++) {
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    await fireMessages(inputPort, [new Uint8Array([0xa1])]); // decodes this slot's body
  }
  return pending;
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
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const first = connection.readPresets();
    await expect(connection.readPresets()).rejects.toThrow('request_in_progress');
    await driveFullRead(first, inputPort, 1);
  });

  test('writePreset rejects with "request_in_progress" while a read is pending (R5)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const first = connection.readPresets();
    await expect(connection.writePreset(fixturePreset(0))).rejects.toThrow('request_in_progress');
    await driveFullRead(first, inputPort, 1);
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
  test('sends the names request, then a Program Change + body request per slot, in slot order (acceptance: PC before each body request)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [
      [
        new Uint8Array([0xaa, 0xaa]), // names request
        new Uint8Array([0xbb, 0x00]), // body request, slot 0
        new Uint8Array([0xbb, 0x01]), // body request, slot 1
        new Uint8Array([0xbb, 0x02]), // body request, slot 2
      ],
    ];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0), isLast: false },
      { kind: 'preset', preset: fixturePreset(1), isLast: false },
      { kind: 'preset', preset: fixturePreset(2), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const pending = connection.readPresets();
    const presets = await driveFullRead(pending, inputPort, 3);

    expect(presets.map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(codec.programChangeCalls).toEqual([0, 1, 2]);

    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent).toEqual([
      [0xaa, 0xaa], // names request first
      [0xc0, 0x00], // Program Change, slot 0
      [0xbb, 0x00], // body request, slot 0 (only after PC + settle)
      [0xc0, 0x01], // Program Change, slot 1
      [0xbb, 0x01], // body request, slot 1
      [0xc0, 0x02], // Program Change, slot 2
      [0xbb, 0x02], // body request, slot 2
    ]);
  });

  test('does not send any Program Change until the names phase completes', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.namesCompleteAfterCalls = 3; // names phase spans 3 incoming chunks
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const pending = connection.readPresets();

    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    expect(codec.programChangeCalls).toEqual([]);
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    expect(codec.programChangeCalls).toEqual([]);

    // Third chunk finishes the names phase — only now does the first PC go out.
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    expect(codec.programChangeCalls).toEqual([0]);

    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    await fireMessages(inputPort, [new Uint8Array([0xa1])]);
    await pending;
  });

  test('waits READ_SETTLE_MS (~300ms) after the Program Change before sending the body request', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete

    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(2); // names request + PC(0)

    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS - 1);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(2); // body request not sent yet

    await vi.advanceTimersByTimeAsync(1);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(3); // body request sent once settled

    await fireMessages(inputPort, [new Uint8Array([0xa1])]);
    await pending;
  });

  test('accumulates presets in the order the slots are decoded, resolving after the last slot (R7, R8)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [
      [new Uint8Array([0x01]), new Uint8Array([0x02]), new Uint8Array([0x03])],
    ];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0, 'first'), isLast: false },
      { kind: 'preset', preset: fixturePreset(1, 'second'), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    const presets = await driveFullRead(pending, inputPort, 2);

    expect(presets.map((p) => p.name)).toEqual(['first', 'second']);
    expect(presets.map((p) => p.slot)).toEqual([0, 1]);
  });

  test('ignores "ignored" decode results without affecting the pending call, extending the per-step deadline instead (R11)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [
      { kind: 'ignored' },
      { kind: 'ignored' },
      { kind: 'preset', preset: fixturePreset(0, 'only'), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    await fireMessages(inputPort, [
      new Uint8Array([0xa1]),
      new Uint8Array([0xa2]),
      new Uint8Array([0xa3]),
    ]);

    const presets = await pending;
    expect(presets).toEqual([fixturePreset(0, 'only')]);
  });

  test('rejects with "invalid_response" when a decode result is "invalid" during a body phase (R10)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'invalid', reason: 'bad crc' }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    pending.catch(() => {});
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    await fireMessages(inputPort, [new Uint8Array([0xa1])]);

    await expect(pending).rejects.toThrow('invalid_response');
  });

  test('rejects with "invalid_response" when a decode result is "invalid" during the names phase', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.namesDecodeResults = [{ kind: 'invalid', reason: 'bad crc' }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    pending.catch(() => {});
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);

    await expect(pending).rejects.toThrow('invalid_response');
    expect(codec.programChangeCalls).toEqual([]); // never reached the body phase
  });

  test('rejects with "read_timeout" when the names phase never completes within READ_STEP_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.namesCompleteAfterCalls = Infinity; // never signals names-complete
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    const { connection } = await connectAndSetup(codec);

    const pending = connection.readPresets();
    pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS + 1);

    await expect(pending).rejects.toThrow('read_timeout');
  });

  test('a stalled slot still times out per-step (R9), instead of waiting for one global 100-slot deadline', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    // No decode result queued for the body phase — the slot 0 body request
    // never gets a matching reply, so decodeIncomingMessage falls back to
    // { kind: 'ignored' } forever.
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    pending.catch(() => {});
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // PC + settle, body request sent

    // The per-step deadline for this stalled slot fires even though the
    // names phase + settle only consumed READ_SETTLE_MS (well under the
    // step budget) — this is the per-slot deadline, not a global one.
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS + 1);

    await expect(pending).rejects.toThrow('read_timeout');
  });

  test('the per-step deadline resets on every chunk received, so a slow multi-chunk body does not time out (R9 extends on progress)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [
      { kind: 'ignored' },
      { kind: 'ignored' },
      { kind: 'preset', preset: fixturePreset(0), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // body request sent

    // Each chunk arrives just under the per-step deadline, resetting it —
    // the cumulative time across all three chunks exceeds READ_STEP_TIMEOUT_MS,
    // but no single gap between chunks does, so this must NOT time out.
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS - 100);
    await fireMessages(inputPort, [new Uint8Array([0xa1])]);
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS - 100);
    await fireMessages(inputPort, [new Uint8Array([0xa2])]);
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS - 100);
    await fireMessages(inputPort, [new Uint8Array([0xa3])]);

    await expect(pending).resolves.toEqual([fixturePreset(0)]);
  });

  test('leaves the pedal on the last slot read (slot 99 for a full dump) rather than restoring it', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: fixturePreset(0), isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    await driveFullRead(pending, inputPort, 1);
    await pending;

    // Only one Program Change is issued (to the one slot this test dumps) and
    // nothing is sent afterward to "restore" a previous slot.
    expect(codec.programChangeCalls).toEqual([0]);
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
      private awaitingNames = false;

      encodeReadAllRequest(): Uint8Array[] {
        const sorted = [...this.store.entries()].sort(([a], [z]) => a - z);
        this.backQueue = sorted.map(([_, preset], i) => ({
          kind: 'preset' as const,
          preset,
          isLast: i === sorted.length - 1,
        }));
        this.awaitingNames = true;
        return [new Uint8Array([0x01]), ...sorted.map(() => new Uint8Array([0x02]))];
      }

      encodeProgramChange(slot: number): Uint8Array {
        return new Uint8Array([0xc0, slot & 0x7f]);
      }

      isAwaitingNames(): boolean {
        return this.awaitingNames;
      }

      decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
        if (this.awaitingNames) {
          // The one names reply frame this fake models — consumes it and
          // transitions to the body phase, same shape as the real codec.
          this.awaitingNames = false;
          return { kind: 'ignored' };
        }
        return this.backQueue.shift() ?? { kind: 'ignored' };
      }

      encodeWriteRequest(preset: Preset): Uint8Array[] {
        this.store.set(preset.slot, preset);
        return [new Uint8Array([0x01])];
      }
    }

    vi.useFakeTimers();
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
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names phase
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // PC(5) settle
    await fireMessages(inputPort, [new Uint8Array([0xa1])]); // slot 5's body

    const presets = await pending;
    expect(presets).toEqual([preset]);
  });
});

// Full read-flow regression guard (feature 13): wires the REAL
// Gp5SysexPresetCodec (not FakeCodec/RoundTripCodec above) into
// WebMidiPedalConnection and drives it with wire-level SysEx bytes shaped
// like the real hardware capture that found the decodeIncomingMessage bug —
// chunked into 19-byte frames, a real per-transfer chunk count at the
// decoded[1] position (106 for the names blob, 25 for each body), and real
// echo bytes. FakeCodec-based tests above stub decodeIncomingMessage
// entirely, so they could not have caught this bug; this test exercises the
// actual byte-level decode logic through the full names + 100-slot
// Program-Change-and-settle-sequenced (feature 12) read orchestration.
describe('WebMidiPedalConnection + real Gp5SysexPresetCodec — full read flow (feature 13)', () => {
  function crc8(bytes: number[]): number {
    let c = 0;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) {
        c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
      }
    }
    return c;
  }

  function nibEncode(buf: number[]): number[] {
    const out: number[] = [];
    for (const b of buf) out.push((b >> 4) & 0x0f, b & 0x0f);
    return out;
  }

  function toWire(buf: number[]): Uint8Array {
    return new Uint8Array([0xf0, ...nibEncode(buf), 0xf7]);
  }

  const CATSEL = 0x12;
  const NAME_SEL = 0x40;
  const BODY_SEL = 0x41;
  const SLOT_COUNT = 100;
  const NAME_LEN = 16;
  const GP5_BODY_LEN = 466;
  const ECHO_LEN = 2;
  const NAMES_BLOB_LEN = ECHO_LEN + SLOT_COUNT * 20;
  const BODY_BLOB_LEN = ECHO_LEN + GP5_BODY_LEN;

  const REC_MODELS_MAGIC = [0x03, 0x30, 0x28, 0x00];
  const REC_BYPASS_MAGIC = [0x01, 0x30, 0x04, 0x00];
  const REC_ORDER_MAGIC = [0x02, 0x30, 0x0a, 0x00];
  const REC_PARAMS_MAGIC = [0x04, 0x30, 0x40, 0x01];

  function buildBody(): Uint8Array {
    const body = new Uint8Array(GP5_BODY_LEN);
    body.set(REC_MODELS_MAGIC, 0);
    body.set(REC_BYPASS_MAGIC, 44);
    body.set(REC_ORDER_MAGIC, 52);
    for (let k = 0; k < 10; k++) body[56 + k] = k;
    body.set(REC_PARAMS_MAGIC, 66);
    const dv = new DataView(body.buffer, 70, 320);
    for (let k = 0; k < 80; k++) dv.setFloat32(k * 4, k / 10, true);
    return body;
  }

  function buildNamesBlob(names: Map<number, string>): Uint8Array {
    const blob = new Uint8Array(NAMES_BLOB_LEN);
    blob[0] = CATSEL;
    blob[1] = NAME_SEL;
    let i = 2;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const dv = new DataView(blob.buffer, i, 4);
      dv.setUint32(0, slot, true);
      const nameBytes = new TextEncoder().encode(names.get(slot) ?? '');
      for (let j = 0; j < NAME_LEN; j++) {
        blob[i + 4 + j] = j < nameBytes.length ? nameBytes[j] : 0;
      }
      i += 20;
    }
    return blob;
  }

  function buildBodyBlob(body: Uint8Array): Uint8Array {
    const blob = new Uint8Array(BODY_BLOB_LEN);
    blob[0] = CATSEL;
    blob[1] = BODY_SEL;
    blob.set(body, ECHO_LEN);
    return blob;
  }

  // Every frame in a transfer carries the SAME chunkCount at decoded[1] — the
  // total number of chunks for that transfer — matching real hardware. Never
  // CATSEL: this is exactly the field feature 13 fixed the decoder to ignore
  // as a gate.
  function chunkForReassembly(blob: Uint8Array): Uint8Array[] {
    const totalChunks = Math.ceil(blob.length / 19);
    const frames: Uint8Array[] = [];
    let i = 0;
    let index = 0;
    while (i < blob.length) {
      const end = Math.min(i + 19, blob.length);
      const payload = Array.from(blob.subarray(i, end));
      const body = [0, totalChunks, index, payload.length, ...payload];
      body[0] = crc8(body.slice(1));
      frames.push(toWire(body));
      i = end;
      index++;
    }
    return frames;
  }

  test('names phase + 100 Program-Change-and-settle-sequenced body reads decode correctly end-to-end', async () => {
    vi.useFakeTimers();

    const codec = new Gp5SysexPresetCodec();
    const { connection, access } = await connectAndSetup(codec as unknown as FakeCodec);
    const inputPort = [...access.inputs.values()][0];

    const names = new Map<number, string>();
    for (let s = 0; s < SLOT_COUNT; s++) names.set(s, `preset${s}`);
    const namesFrames = chunkForReassembly(buildNamesBlob(names));
    // Matches the real hardware capture's names-phase chunk count exactly.
    expect(namesFrames.length).toBe(106);

    const bodyFrames = chunkForReassembly(buildBodyBlob(buildBody()));
    // Matches the real hardware capture's per-slot body chunk count exactly.
    expect(bodyFrames.length).toBe(25);

    const pending = connection.readPresets();

    await fireMessages(inputPort, namesFrames);

    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
      await fireMessages(inputPort, bodyFrames);
    }

    const presets = await pending;

    expect(presets).toHaveLength(SLOT_COUNT);
    expect(presets[0].slot).toBe(0);
    expect(presets[0].name).toBe('preset0');
    expect(presets[SLOT_COUNT - 1].slot).toBe(SLOT_COUNT - 1);
    expect(presets[SLOT_COUNT - 1].name).toBe(`preset${SLOT_COUNT - 1}`);
    // Every slot's body decoded the same fixture body — spot-check the
    // magic-marker-derived fields came through the full stack intact.
    for (const preset of presets) {
      expect(preset.chain).toHaveLength(10);
      expect(preset.chain[0].enabled).toBe(false); // bypass mask was all zeros
    }
  }, 20000);
});
