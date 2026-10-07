import { describe, expect, test, vi, afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  WebMidiPedalConnection,
  READ_SETTLE_MS,
  READ_STEP_TIMEOUT_MS,
  WRITE_ACK_TIMEOUT_MS,
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
// The first message decoded after encodeActivePresetRequest() is the
// active-preset reply; slotsMatchingActivePreset() returns `activeMatches`.
// FakeCodec's stand-ins for the pedal's write-chunk ACK / NAK (see
// decodeWriteReply).
const FAKE_WRITE_ACK = new Uint8Array([0xa5]);
const FAKE_WRITE_NAK = new Uint8Array([0xa6]);

function fakeDecodeWriteReply(message: Uint8Array): 'ack' | 'nak' | null {
  if (message.length !== 1) return null;
  if (message[0] === FAKE_WRITE_ACK[0]) return 'ack';
  if (message[0] === FAKE_WRITE_NAK[0]) return 'nak';
  return null;
}

class FakeCodec implements SysexPresetCodec {
  readMessageSets: Uint8Array[][] = [];
  writeMessageSets: Uint8Array[][] = [];
  decodeResults: SysexDecodeResult[] = [];
  selectCalls: number[] = [];
  activeRequestCalls = 0;
  activeMatches: number[] = [0];
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
  private awaitingActive = false;

  encodeReadAllRequest(): Uint8Array[] {
    this.encodeReadAllRequestCalls++;
    this.awaitingNames = true;
    this.namesCallCount = 0;
    return this.readMessageSets[this.encodeReadAllRequestCalls - 1] ?? [];
  }

  encodeSelectPreset(slot: number): Uint8Array {
    this.selectCalls.push(slot);
    return new Uint8Array([0xb0, 0x00, slot & 0x7f]);
  }

  encodeActivePresetRequest(): Uint8Array {
    this.activeRequestCalls++;
    this.awaitingActive = true;
    return new Uint8Array([0xac]);
  }

  slotsMatchingActivePreset(): number[] {
    return this.activeMatches;
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

  decodeWriteReply(message: Uint8Array): 'ack' | 'nak' | null {
    return fakeDecodeWriteReply(message);
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
    if (this.awaitingActive) {
      this.awaitingActive = false;
      return { kind: 'activePreset' };
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

// Has the pedal ACK `count` write packets, one at a time (writePreset sends
// the next packet synchronously on each ACK — stop-and-wait, feature 28).
async function ackPackets(input: FakePort, count: number): Promise<void> {
  await fireMessages(input, Array.from({ length: count }, () => FAKE_WRITE_ACK));
}

// Fires the names-complete message, then the active-preset reply to the
// pre-read body request that readPresets sends right after the names phase.
async function completeNamesAndActive(inputPort: FakePort): Promise<void> {
  await fireMessages(inputPort, [new Uint8Array([0xa0])]); // completes the names phase
  await fireMessages(inputPort, [new Uint8Array([0xac])]); // active-preset body
}

// Drives one full read-all dump against a FakeCodec configured with a names
// message + one body-request message per fixture preset: completes the names
// and active-preset steps, then for each slot advances the settle delay
// (READ_SETTLE_MS after the slot selection) before firing the body-decode
// message. Assumes fake timers are active.
async function driveFullRead(
  pending: Promise<Preset[]>,
  inputPort: FakePort,
  slotCount: number,
): Promise<Preset[]> {
  await completeNamesAndActive(inputPort);
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

  test('returns to "connected" when a stored input port onstatechange fires with state "connected" after a disconnect (patch 2026-10-06)', async () => {
    const access = fakeAccess(
      [{ name: 'Valeton GP-5' }],
      [{ name: 'Valeton GP-5' }],
    );
    stubRequestMidiAccess(() => Promise.resolve(access));
    const { connection } = setup();

    await connection.connect();
    expect(connection.connectionState()).toBe('connected');

    const inputPort = [...access.inputs.values()][0];

    inputPort.state = 'disconnected';
    inputPort.onstatechange?.(new Event('statechange'));
    expect(connection.connectionState()).toBe('not-connected');

    inputPort.state = 'connected';
    inputPort.onstatechange?.(new Event('statechange'));
    expect(connection.connectionState()).toBe('connected');
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
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.writeMessageSets = [[new Uint8Array([0x01, 0x02, 0x03])]];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const first = connection.writePreset(fixturePreset(0));
    await expect(connection.readPresets()).rejects.toThrow('request_in_progress');
    await ackPackets(inputPort, 1);
    await first;
  });
});

describe('WebMidiPedalConnection.readPresets — orchestration', () => {
  test('sends the names request, the active-preset request, then a CC0 selection + body request per slot, then restores the pre-read preset', async () => {
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
    codec.activeMatches = [1];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const pending = connection.readPresets();
    const presets = await driveFullRead(pending, inputPort, 3);

    expect(presets.map((p) => p.slot)).toEqual([0, 1, 2]);
    // Each slot is selected before its body request, since the body request
    // itself carries no slot number.
    expect(codec.selectCalls).toEqual([0, 1, 2, 1]);
    expect(connection.restoreWarning()).toBeNull();

    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent).toEqual([
      [0xaa, 0xaa], // names request first
      [0xac], // active-preset body request, no selection before it
      [0xb0, 0x00, 0x00], // CC0 slot 0
      [0xbb, 0x00], // body request, slot 0
      [0xb0, 0x00, 0x01], // CC0 slot 1
      [0xbb, 0x01], // body request, slot 1
      [0xb0, 0x00, 0x02], // CC0 slot 2
      [0xbb, 0x02], // body request, slot 2
      [0xb0, 0x00, 0x01], // restore: back to the slot matching the pre-read body
    ]);
  });

  test('does not send the active-preset request, any selection or body request until the names phase completes', async () => {
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
    // Only the names request went out so far.
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(1);
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(1);

    // Third chunk finishes the names phase — only now does the
    // active-preset request go out. No slot is selected before its reply.
    await fireMessages(inputPort, [new Uint8Array([0xa0])]);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(2);
    expect(codec.selectCalls).toEqual([]);

    // Active-preset reply: slot 0 is selected; its body request is gated
    // on READ_SETTLE_MS after that selection.
    await fireMessages(inputPort, [new Uint8Array([0xac])]);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(4);

    await fireMessages(inputPort, [new Uint8Array([0xa1])]);
    await pending;
  });

  test('waits READ_SETTLE_MS (~300ms) after the slot selection before sending the body request', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.readMessageSets = [
      [new Uint8Array([0x01]), new Uint8Array([0x02]), new Uint8Array([0x03])],
    ];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0), isLast: false },
      { kind: 'preset', preset: fixturePreset(1), isLast: true },
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const pending = connection.readPresets();
    await completeNamesAndActive(inputPort);

    // Names request + active-preset request + slot 0 selection.
    // Body request is gated on READ_SETTLE_MS after the selection.
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(3);

    // Advance just under the settle delay — body request must NOT have fired yet.
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS - 1);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(3);

    // Advance past the settle delay — body request fires now.
    await vi.advanceTimersByTimeAsync(1);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(4);

    // Drive slot 0's reply, then slot 1's selection + body with another settle.
    await fireMessages(inputPort, [new Uint8Array([0xa1])]);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(5); // slot 1 selection fired

    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(6); // slot 1 body fired

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

  test('resolves a preset whose raw bytes came from the codec unchanged (R4)', async () => {
    vi.useFakeTimers();
    const rawBody = new Uint8Array(466);
    for (let i = 0; i < 466; i++) rawBody[i] = (i * 7) & 0xff;
    const rawName = new Uint8Array(16);
    rawName.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
    const presetWithRaw: Preset = {
      slot: 5,
      name: 'TL DLX AMP',
      chain: [{ moduleType: 'cat7_fx4', enabled: true, parameters: {} }],
      raw: { body: rawBody, nameField: rawName },
    };
    const codec = new FakeCodec();
    codec.readMessageSets = [[new Uint8Array([0x01]), new Uint8Array([0x02])]];
    codec.decodeResults = [{ kind: 'preset', preset: presetWithRaw, isLast: true }];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const presets = await driveFullRead(connection.readPresets(), inputPort, 1);

    expect(presets[0].raw).toBeDefined();
    expect(presets[0].raw!.body).toBe(rawBody);
    expect(presets[0].raw!.nameField).toBe(rawName);
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
    await completeNamesAndActive(inputPort); // slot 0 selection fires
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // body request fires
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
    await completeNamesAndActive(inputPort); // slot 0 selection fires
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // body request fires
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
    expect(codec.activeRequestCalls).toBe(0); // never reached the body phase
    expect(codec.selectCalls).toEqual([]);
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
    await completeNamesAndActive(inputPort); // slot 0 selection fires
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // body request fires, its wait step armed
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // advances the per-step deadline

    // The per-step deadline for this stalled slot fires even though the
    // names phase consumed no time (well under the step budget) — this is
    // the per-slot deadline, not a global one.
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
    await completeNamesAndActive(inputPort); // slot 0 selection fires
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // body request fires

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

  function threeSlotCodec(activeMatches: number[]): FakeCodec {
    const codec = new FakeCodec();
    codec.readMessageSets = [
      [new Uint8Array([0x01]), new Uint8Array([0x02]), new Uint8Array([0x02]), new Uint8Array([0x02])],
    ];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0), isLast: false },
      { kind: 'preset', preset: fixturePreset(1), isLast: false },
      { kind: 'preset', preset: fixturePreset(2), isLast: true },
    ];
    codec.activeMatches = activeMatches;
    return codec;
  }

  test('selects slots with CC0 [0xb0, 0x00, slot], never a Program Change (the GP-5 ignores PC)', async () => {
    vi.useFakeTimers();
    const { connection, access } = await connectAndSetup(threeSlotCodec([0]));
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    await driveFullRead(connection.readPresets(), inputPort, 3);

    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent.filter((m) => (m[0] & 0xf0) === 0xc0)).toEqual([]);
    expect(sent.filter((m) => m[0] === 0xb0)).toEqual([
      [0xb0, 0x00, 0x00],
      [0xb0, 0x00, 0x01],
      [0xb0, 0x00, 0x02],
      [0xb0, 0x00, 0x00], // restore
    ]);
  });

  test('restores the pre-read preset with one final CC0 when exactly one slot matches it', async () => {
    vi.useFakeTimers();
    const codec = threeSlotCodec([2]);
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const presets = await driveFullRead(connection.readPresets(), inputPort, 3);

    expect(presets.map((p) => p.slot)).toEqual([0, 1, 2]);
    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent.at(-1)).toEqual([0xb0, 0x00, 0x02]);
    expect(codec.selectCalls).toEqual([0, 1, 2, 2]);
    expect(connection.restoreWarning()).toBeNull();
  });

  test('stays on the last slot read and sets restoreWarning "restore_no_match" when no slot matches', async () => {
    vi.useFakeTimers();
    const codec = threeSlotCodec([]);
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const presets = await driveFullRead(connection.readPresets(), inputPort, 3);

    expect(presets).toHaveLength(3);
    expect(codec.selectCalls).toEqual([0, 1, 2]); // no restore selection
    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent.at(-1)).toEqual([0x02]); // last message is slot 2's body request
    expect(connection.restoreWarning()).toBe('restore_no_match');
  });

  test('stays on the last slot read and sets restoreWarning "restore_ambiguous" when several slots match', async () => {
    vi.useFakeTimers();
    const codec = threeSlotCodec([0, 2]);
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const presets = await driveFullRead(connection.readPresets(), inputPort, 3);

    expect(presets).toHaveLength(3);
    expect(codec.selectCalls).toEqual([0, 1, 2]);
    expect(connection.restoreWarning()).toBe('restore_ambiguous');
  });

  test('clears a previous restoreWarning when a new read starts', async () => {
    vi.useFakeTimers();
    const codec = threeSlotCodec([]);
    codec.readMessageSets.push(codec.readMessageSets[0]);
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    await driveFullRead(connection.readPresets(), inputPort, 3);
    expect(connection.restoreWarning()).toBe('restore_no_match');

    codec.activeMatches = [1];
    codec.decodeResults = [
      { kind: 'preset', preset: fixturePreset(0), isLast: false },
      { kind: 'preset', preset: fixturePreset(1), isLast: false },
      { kind: 'preset', preset: fixturePreset(2), isLast: true },
    ];
    const second = connection.readPresets();
    expect(connection.restoreWarning()).toBeNull();
    await driveFullRead(second, inputPort, 3);
    expect(connection.restoreWarning()).toBeNull();
  });

  test('rejects with "read_timeout" when the active-preset reply never arrives, without selecting any slot', async () => {
    vi.useFakeTimers();
    const codec = threeSlotCodec([0]);
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.readPresets();
    pending.catch(() => {});
    await fireMessages(inputPort, [new Uint8Array([0xa0])]); // names complete only
    await vi.advanceTimersByTimeAsync(READ_STEP_TIMEOUT_MS + 1);

    await expect(pending).rejects.toThrow('read_timeout');
    expect(codec.activeRequestCalls).toBe(1);
    expect(codec.selectCalls).toEqual([]);
  });
});

describe('WebMidiPedalConnection.writePreset — orchestration', () => {
  test('sends every message from encodeWriteRequest in order via output.send (R12)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.writeMessageSets = [
      [
        new Uint8Array([0x11, 0x4f]),
        new Uint8Array([0x22, 0x33]),
        new Uint8Array([0x44, 0x55]),
      ],
    ];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const pending = connection.writePreset(fixturePreset(3));
    await ackPackets(inputPort, 3);
    await pending;

    const outputPort = [...access.outputs.values()][0];
    expect(outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array))).toEqual([
      [0x11, 0x4f],
      [0x22, 0x33],
      [0x44, 0x55],
    ]);
  });

  // R13 as amended by feature 28: "all messages sent" is not enough — the
  // call resolves once the pedal has ACKed every one of them.
  test('resolves once every sent message is ACKed by the pedal (R13, feature 28)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.writeMessageSets = [[new Uint8Array([0x01, 0x02]), new Uint8Array([0x03, 0x04])]];
    const { connection, access } = await connectAndSetup(codec);
    const inputPort = [...access.inputs.values()][0];

    const preset = fixturePreset(0);
    const pending = connection.writePreset(preset);
    await ackPackets(inputPort, 2);
    await expect(pending).resolves.toBeUndefined();
    expect(codec.encodeWriteRequestCalls).toEqual([preset]);
  });
});

// Feature 28: writePreset is stop-and-wait, like Valeton Suite — packet i+1
// goes out only after the pedal ACKs packet i; a NAK aborts with
// write_rejected; no reply within WRITE_ACK_TIMEOUT_MS aborts with
// write_timeout. No slot selection (CC0) is sent: the slot is in the header.
// Evidence: progress/gp5_suite_write_capture_2.txt, progress/gp5_app_write_capture.txt.
describe('WebMidiPedalConnection.writePreset — stop-and-wait ACK pacing (feature 28)', () => {
  const PACKET_COUNT = 26;
  const packets = Array.from({ length: PACKET_COUNT }, (_, i) => new Uint8Array([0xf0, 0x11, i, 0xf7]));
  const NON_ACK = new Uint8Array([0xf0, 0x12, 0x1b, 0xf7]);
  const packetBytes = (n: number) => packets.slice(0, n).map((p) => Array.from(p));

  async function startWrite(slot = 7): Promise<{
    connection: WebMidiPedalConnection;
    codec: FakeCodec;
    input: FakePort;
    sent: () => number[][];
    pending: Promise<void>;
    settled: () => boolean;
  }> {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.writeMessageSets = [packets, packets]; // the follow-up write is 26 packets too
    const { connection, access } = await connectAndSetup(codec);
    const outputPort = [...access.outputs.values()][0];
    const input = [...access.inputs.values()][0];
    const sent = () => outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    const pending = connection.writePreset(fixturePreset(slot));
    let done = false;
    pending.then(
      () => (done = true),
      () => (done = true),
    );
    return { connection, codec, input, sent, pending, settled: () => done };
  }

  test('the per-chunk ACK timeout is 1000ms', () => {
    expect(WRITE_ACK_TIMEOUT_MS).toBe(1000);
  });

  test('sends no slot selection (CC0) — only write packets, packet 0 immediately', async () => {
    const { codec, input, sent, pending } = await startWrite(7);

    expect(codec.selectCalls).toEqual([]);
    expect(sent()).toEqual(packetBytes(1));

    await ackPackets(input, PACKET_COUNT);
    await pending;
    expect(codec.selectCalls).toEqual([]);
    expect(sent()).toEqual(packetBytes(PACKET_COUNT));
    expect(sent().some((m) => (m[0] & 0xf0) === 0xb0)).toBe(false);
  });

  test('packet i+1 is NOT sent until ACK i arrives, however long the wait (within the timeout)', async () => {
    const { input, sent, pending } = await startWrite();

    for (let i = 1; i < PACKET_COUNT; i++) {
      await vi.advanceTimersByTimeAsync(WRITE_ACK_TIMEOUT_MS - 1);
      expect(sent()).toEqual(packetBytes(i));
      await fireMessages(input, [FAKE_WRITE_ACK]);
      expect(sent()).toEqual(packetBytes(i + 1));
    }
    await fireMessages(input, [FAKE_WRITE_ACK]);
    await expect(pending).resolves.toBeUndefined();
  });

  test('happy path: 26 ACKs resolve, after the 26th and not after 25', async () => {
    const { input, sent, pending, settled } = await startWrite();

    await ackPackets(input, PACKET_COUNT - 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent()).toEqual(packetBytes(PACKET_COUNT));
    expect(settled()).toBe(false);

    await fireMessages(input, [FAKE_WRITE_ACK]);
    await expect(pending).resolves.toBeUndefined();
  });

  test('a NAK mid-stream rejects with "write_rejected", sends no further packets, and releases the operation', async () => {
    const { connection, input, sent, pending } = await startWrite();
    const rejection = expect(pending).rejects.toThrow('write_rejected');

    await ackPackets(input, 3);
    await fireMessages(input, [FAKE_WRITE_NAK]);
    await rejection;
    expect(sent()).toEqual(packetBytes(4));

    // Late ACKs after the abort send nothing and time nothing out.
    await ackPackets(input, 5);
    await vi.advanceTimersByTimeAsync(WRITE_ACK_TIMEOUT_MS * 2);
    expect(sent()).toEqual(packetBytes(4));

    const next = connection.writePreset(fixturePreset(2));
    await ackPackets(input, PACKET_COUNT);
    await expect(next).resolves.toBeUndefined();
  });

  test('a missing ACK rejects with "write_timeout" after WRITE_ACK_TIMEOUT_MS, then releases the operation', async () => {
    const { connection, input, sent, pending, settled } = await startWrite();
    const rejection = expect(pending).rejects.toThrow('write_timeout');

    await ackPackets(input, 5);
    await vi.advanceTimersByTimeAsync(WRITE_ACK_TIMEOUT_MS - 1);
    expect(settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(sent()).toEqual(packetBytes(6));

    // A late ACK arriving while no write is pending is dropped; the next write needs its own 26.
    await fireMessages(input, [FAKE_WRITE_ACK]);
    expect(sent()).toEqual(packetBytes(6));
    let nextDone = false;
    const next = connection.writePreset(fixturePreset(2));
    next.then(() => (nextDone = true), () => (nextDone = true));
    await ackPackets(input, PACKET_COUNT - 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(nextDone).toBe(false);
    await fireMessages(input, [FAKE_WRITE_ACK]);
    await expect(next).resolves.toBeUndefined();
  });

  test('ignores unrelated frames (e.g. the 0x12 0x1b notification): they neither advance nor abort the write', async () => {
    const { input, sent, pending, settled } = await startWrite();

    await ackPackets(input, 10);
    await fireMessages(input, [NON_ACK, NON_ACK]);
    expect(sent()).toEqual(packetBytes(11));
    await ackPackets(input, PACKET_COUNT - 11);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled()).toBe(false); // 25 ACKs; the notifications didn't count

    await fireMessages(input, [FAKE_WRITE_ACK]);
    await expect(pending).resolves.toBeUndefined();
  });

  test('holds the operation until the last ACK: concurrent read/write reject with "request_in_progress" (R5)', async () => {
    const { connection, input, sent, pending, settled } = await startWrite();

    await expect(connection.writePreset(fixturePreset(1))).rejects.toThrow('request_in_progress');
    await ackPackets(input, PACKET_COUNT - 1);
    expect(sent()).toHaveLength(PACKET_COUNT);
    expect(settled()).toBe(false);
    await expect(connection.readPresets()).rejects.toThrow('request_in_progress');
    await expect(connection.writePreset(fixturePreset(1))).rejects.toThrow('request_in_progress');

    await fireMessages(input, [FAKE_WRITE_ACK]);
    await pending;

    // Released afterwards: a new write proceeds normally.
    const next = connection.writePreset(fixturePreset(2));
    await ackPackets(input, PACKET_COUNT);
    await expect(next).resolves.toBeUndefined();
  });

  test('rejects with the send error, sends nothing more and releases, when output.send throws mid-stream', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.writeMessageSets = [packets];
    const { connection, access } = await connectAndSetup(codec);
    const outputPort = [...access.outputs.values()][0];
    const input = [...access.inputs.values()][0];
    let calls = 0;
    outputPort.__sendSpy.mockImplementation(() => {
      if (++calls === 3) throw new Error('port_closed');
    });

    const pending = connection.writePreset(fixturePreset(0));
    const rejection = expect(pending).rejects.toThrow('port_closed');
    await ackPackets(input, 2);
    await rejection;
    await ackPackets(input, 3);
    expect(outputPort.__sendSpy).toHaveBeenCalledTimes(3);

    outputPort.__sendSpy.mockImplementation(() => undefined);
    codec.writeMessageSets.push(packets);
    const next = connection.writePreset(fixturePreset(1));
    await ackPackets(input, PACKET_COUNT);
    await expect(next).resolves.toBeUndefined();
  });

  test('releases the operation when encodeWriteRequest throws, sending nothing (R14 errors still surface)', async () => {
    vi.useFakeTimers();
    const codec = new FakeCodec();
    codec.encodeWriteRequest = () => {
      throw new Error('protocol_unconfirmed');
    };
    const { connection, access } = await connectAndSetup(codec);
    const outputPort = [...access.outputs.values()][0];

    await expect(connection.writePreset(fixturePreset(0))).rejects.toThrow('protocol_unconfirmed');
    expect(outputPort.__sendSpy).not.toHaveBeenCalled();

    const next = connection.writePreset(fixturePreset(0));
    await expect(next).rejects.toThrow('protocol_unconfirmed');
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

      private awaitingActive = false;

      encodeSelectPreset(slot: number): Uint8Array {
        return new Uint8Array([0xb0, 0x00, slot & 0x7f]);
      }

      encodeActivePresetRequest(): Uint8Array {
        this.awaitingActive = true;
        return new Uint8Array([0x03]);
      }

      slotsMatchingActivePreset(): number[] {
        return [];
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
        if (this.awaitingActive) {
          this.awaitingActive = false;
          return { kind: 'activePreset' };
        }
        return this.backQueue.shift() ?? { kind: 'ignored' };
      }

      encodeWriteRequest(preset: Preset): Uint8Array[] {
        this.store.set(preset.slot, preset);
        return [new Uint8Array([0x01])];
      }

      decodeWriteReply(message: Uint8Array): 'ack' | 'nak' | null {
        return fakeDecodeWriteReply(message);
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

    const writing = connection.writePreset(preset);
    await ackPackets(inputPort, 1); // the pedal's ACK (feature 28)
    await writing;

    const pending = connection.readPresets();
    await completeNamesAndActive(inputPort);
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS); // selection settle, body request fires
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
// actual byte-level decode logic through the full names + active preset +
// 100-slot CC0-selected read orchestration.
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

  // Real 466-byte bodies from the live GP-5 capture
  // progress/gp5_f24_capture_2026-09-30T17-50-31-876Z.json: slots 0-2 read
  // with CC0 selection (runs[2]), and the preset that was active on the pedal
  // (preset 14, runs[0]) — none of slots 0-2 match it.
  const CAPTURED_SLOT_BODIES_HEX: readonly string[] = [
    // slot 0 "TL DLX AMP"
    [
      'ff0010000100040001000000020004000a454d5100001000011004000a00000002100400080000000100100001200400',
      '32000000022004007800000002008601013004001a00000002300a0000010209030405060708033028001b0000000000',
      '000000000003040000070000100a36000001080000040400000b0000000c3400000f043040010000e041000000000000',
      '000000000000000000000000000000000000000000000000004100006442000048420000204100000000000000000000',
      '0000000000000000000000008c420000484200000000000000000000000000000000000000000000804200008a420000',
      '0c4200006c42000070420000803f00000000000000000000484200000000000000000000000000000000000000000000',
      '0000000000000000a04000000040000080400000a0400000803f000018420000000000000000000000410000003f0000',
      '48420000000000000000000000000000000000000000000010410000884300002842000000000000803f000000000000',
      '0000000000000000884100005c42000010420000803f00004842000000000000000000000000000034420000ac420000',
      '48420000484200004842000000000000000000000000030008000000000007000000',
    ].join(''),
    // slot 1 "TL AC3 AMP"
    [
      'ff0010000100040001000000020004000a454d5100001000011004000a00000002100400080000000100100001200400',
      '32000000022004007800000002008601013004003a00000002300a0000010209030405060708033028001b0000000000',
      '000000000003110000070200100a36000001080000040400000b0000000c3400000f043040010000e041000000000000',
      '000000000000000000000000000000000000000000000000004100002042000048420000204100000000000000000000',
      '0000000000000000000000008c420000484200000000000000000000000000000000000000000000f041000048420000',
      'd8410000803f000070420000803f00000000000000000000484200000000000000000000000000000000000000000000',
      '0000000000000000a040000000400000004000000040000020c1000018420000000000000000000000410000003f0000',
      '48420000000000000000000000000000000000000000000010410000884300002842000000000000803f000000000000',
      '0000000000000000884100005c42000010420000803f00004842000000000000000000000000000034420000ac420000',
      '48420000484200004842000000000000000000000000030008000400000007000000',
    ].join(''),
    // slot 2 "TL PLX AMP"
    [
      'ff0010000100040001000000020004000a454d5100001000011004000a00000002100400080000000100100001200400',
      '32000000022004007800000002008601013004003a00000002300a0000010209030405060708033028001b0000000000',
      '0000000000032f0000070100100a36000001080000040400000b0000000c3400000f043040010000e041000000000000',
      '000000000000000000000000000000000000000000000000004100002042000048420000204100000000000000000000',
      '0000000000000000000000008c420000484200000000000000000000000000000000000000000000803f0000a0420000',
      'c24200002042000084420000a04200000040000000000000484200000000000000000000000000000000000000000000',
      '000000000000000080bf000080bf000000000000a0400000803f000040420000000000000000000000410000003f0000',
      '48420000000000000000000000000000000000000000000010410000884300002842000000000000803f000000000000',
      '0000000000000000884100005c42000010420000803f00004842000000000000000000000000000034420000ac420000',
      '48420000484200004842000000000000000000000000030008000400000007000000',
    ].join(''),
  ];
  const CAPTURED_ACTIVE_PRESET_14_HEX = [
      'ff0010000100040001000000020004000a454d5100001000011004000a00000002100400080000000100100001200400',
      '45000000022004007800000002008601013004001901000002300a0000010209030405060708033028001b0000001a00',
      '0000000000032f0000072200000a35000001000000040200000b1000000c0000000f043040010000e041000000000000',
      '00000000000000000000000000000000000000000000000004420000803f0000803f0000000000000000000000000000',
      '0000000000000000b442000004420000684200000000000000000000000000000000000000000000a041000048420000',
      '86420000f041000070420000824200007042000000000000484200000000000000000000000000000000000000000000',
      '00000000000000000000000000000000000000000000000000000000484200000000000000000000a0410000003f0000',
      '484200000000000000000000000000000000000000000000a04100007c430000b8410000000000000000000000000000',
      '0000000000000000a841000048420000b041000000000000b84100004842000000000000000000004842000048420000',
      '48420000484200004842000000000000000000000000030008000200000007000000',
  ].join('');
  // The unsolicited frame the pedal sent ~3-50ms after every CC0 in that
  // capture (decoded [0xe2, 0x01, 0x00, 0x06, 0x12, 0x1b, 0x01, 0x00, 0x00, 0x00]).
  const CAPTURED_PATCH_CHANGE_NOTIFICATION = new Uint8Array([
    0xf0, 0x0e, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x01, 0x02, 0x01, 0x0b, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0xf7,
  ]);

  function hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  // Slots 0-2 get the captured bodies; every other slot a synthetic body
  // made distinct by stamping the slot number into the trailing padding.
  function slotBody(slot: number): Uint8Array {
    if (slot < CAPTURED_SLOT_BODIES_HEX.length) return hexToBytes(CAPTURED_SLOT_BODIES_HEX[slot]);
    const body = buildBody();
    body[GP5_BODY_LEN - 1] = slot;
    return body;
  }

  async function driveRealRead(
    pending: Promise<Preset[]>,
    inputPort: FakePort,
    activeBody: Uint8Array,
  ): Promise<Preset[]> {
    const names = new Map<number, string>();
    for (let s = 0; s < SLOT_COUNT; s++) names.set(s, `preset${s}`);
    const namesFrames = chunkForReassembly(buildNamesBlob(names));
    // Matches the real hardware capture's names-phase chunk count exactly.
    expect(namesFrames.length).toBe(106);

    await fireMessages(inputPort, namesFrames);
    await fireMessages(inputPort, chunkForReassembly(buildBodyBlob(activeBody)));
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      // The CC0 for this slot has just gone out; the pedal's notification
      // arrives during the settle, before the body request.
      await fireMessages(inputPort, [CAPTURED_PATCH_CHANGE_NOTIFICATION]);
      await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
      const bodyFrames = chunkForReassembly(buildBodyBlob(slotBody(slot)));
      // Matches the real hardware capture's per-slot body chunk count exactly.
      expect(bodyFrames.length).toBe(25);
      await fireMessages(inputPort, bodyFrames);
    }
    return pending;
  }

  test('names + active preset + 100 CC0-selected body reads decode each slot\'s own chain, then restore the active slot', async () => {
    vi.useFakeTimers();

    const codec = new Gp5SysexPresetCodec();
    const { connection, access } = await connectAndSetup(codec as unknown as FakeCodec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];
    for (const hex of CAPTURED_SLOT_BODIES_HEX) expect(hexToBytes(hex)).toHaveLength(GP5_BODY_LEN);

    const presets = await driveRealRead(connection.readPresets(), inputPort, slotBody(1));

    expect(presets).toHaveLength(SLOT_COUNT);
    expect(presets.map((p) => p.slot)).toEqual(Array.from({ length: SLOT_COUNT }, (_, i) => i));
    expect(presets[0].name).toBe('preset0');
    expect(presets[SLOT_COUNT - 1].name).toBe(`preset${SLOT_COUNT - 1}`);
    // Each captured slot decodes to its own AMP block (REC_MODELS block 3,
    // chain position 4 after REC_ORDER [0,1,2,9,3,...]).
    expect(presets.slice(0, 3).map((p) => p.chain[4].moduleType)).toEqual([
      'cat7_fx4',
      'cat7_fx11',
      'cat7_fx2f',
    ]);
    for (const preset of presets) expect(preset.chain).toHaveLength(10);

    const sent = outputPort.__sendSpy.mock.calls.map((c) => Array.from(c[0] as Uint8Array));
    expect(sent.at(-1)).toEqual([0xb0, 0x00, 0x01]);
    expect(connection.restoreWarning()).toBeNull();
  }, 20000);

  test('with the captured active preset 14 matching no slot, stays on slot 99 and warns "restore_no_match"', async () => {
    vi.useFakeTimers();

    const codec = new Gp5SysexPresetCodec();
    const { connection, access } = await connectAndSetup(codec as unknown as FakeCodec);
    const inputPort = [...access.inputs.values()][0];
    const outputPort = [...access.outputs.values()][0];

    const presets = await driveRealRead(
      connection.readPresets(),
      inputPort,
      hexToBytes(CAPTURED_ACTIVE_PRESET_14_HEX),
    );

    expect(presets).toHaveLength(SLOT_COUNT);
    const selections = outputPort.__sendSpy.mock.calls
      .map((c) => Array.from(c[0] as Uint8Array))
      .filter((m) => m[0] === 0xb0);
    expect(selections).toHaveLength(SLOT_COUNT);
    expect(selections.at(-1)).toEqual([0xb0, 0x00, 99]);
    expect(connection.restoreWarning()).toBe('restore_no_match');
  }, 20000);
});
