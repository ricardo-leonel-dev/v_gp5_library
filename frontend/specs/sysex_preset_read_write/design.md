# Design — sysex_preset_read_write

## Open question — history and current status (2026-09-26/27 research)

This pedal is a GP-5. `valeton-gp50`'s reverse-engineering docs were originally written against **GP-50**
hardware (a different, related Valeton pedal — bigger screen, battery, second footswitch — see
[Andertons' comparison](https://blog.andertons.co.uk/learn/valeton-gp-50-vs-gp-5)), so nothing was taken
on faith: every piece of the protocol this feature needs has since been checked against Ricardo's actual
GP-5. Status:

1. **License — RESOLVED.** [`LICENSE`](https://github.com/drewmerc302/valeton-gp50/blob/master/LICENSE)
   is the standard **MIT License** (Copyright (c) 2026 Andrew Mercurio) — permissive, compatible with
   this proprietary project. Condition: "The above copyright notice and this permission notice shall be
   included in all copies or substantial portions of the Software" — R16's header comment must preserve
   that notice verbatim in any file where code/tables are actually adapted.
2. **Read: patch names (selector `0x40`) — CONFIRMED on real GP-5 hardware.** Read-only probe
   (`progress/gp5_webmidi_read_probe.html`, adapted from `valeton-gp50`'s own `app/static/webmidi_probe.html`)
   sent `buildRequest(0x40)` (`f0 00 0e 00 01 00 00 00 02 01 02 04 00 f7`), got 106 reply frames, parsed
   all **100 patch names**. Confirms the transport (CRC-8/0x07, nibble framing, reply reassembly) against
   a GP-5, not just a GP-50.
3. **Read: full preset body (selector `0x41`) — CONFIRMED on real GP-5 hardware.** Second read-only probe
   (`progress/gp5_webmidi_body_read_probe.html`, porting `patch/scan_bank.py`/`select_patch.py`'s tested
   Program-Change-then-read sequence) against slot 1: got 25 reply frames reassembling to exactly **466
   bytes** — `prst_format.py`'s `GP5` profile body length (`prst_len=507`, `BODY_OFF=0x29` → 466), not the
   GP-50's 511. All four body records decoded cleanly: `REC_MODELS` (10 blocks), `REC_BYPASS` (mask
   `0x1bf`), `REC_ORDER` (valid permutation `[0,1,2,9,3,4,5,6,7,8]`), `REC_PARAMS` (80 float32s). **Read is
   fully confirmed** — names and full signal chain, both working exactly as `prst_format.py` documents for
   `GP5`.
4. **Write (bulk patch upload) — STRONGLY CORROBORATED on real GP-5 hardware, though not byte-instrumented.**
   `gp5_write_corroboration.py` already cross-checked the *read* protocol and the `[0x11,0x4X]` edit-command
   family against 3rd-party GP-5 projects, but flagged the bulk write (cmd `0x1D`, 19-byte chunks) as
   unconfirmed on GP-5 — `WRITE_VERIFIED = {"gp50": True, "gp5": False}` in `device_write.py`, with an
   explicit safety note: *"the pedal wedged once from unvalidated traffic — never send a guessed write
   command."* Rather than send a guessed write ourselves, Ricardo used **Valeton Suite** (the vendor app)
   to import a patch into scratch slot 97 (after a full 100-preset backup via
   `progress/gp5_webmidi_backup_all.html`), while `progress/gp5_webmidi_write_capture.html` passively
   listened on the GP-5's MIDI **input** port (device→host only — Web MIDI cannot observe another app's
   outgoing host→device traffic, which is why cmd `0x1D` itself is structurally invisible to this method).
   Result: the pedal's sound and full configuration audibly changed (confirming a real write landed), and
   the capture recorded **exactly 26 identical device ACK frames** in rapid succession (~1–2 ms apart).
   That count is not incidental: GP-5's predicted write payload is `6-byte header + (prst_len[507] -
   NAME_OFF[0x19/25]) = 488 bytes`, and `488 / 19-byte blocks = 26 blocks` (25 full + one 13-byte tail) —
   the exact block count predicted by porting the GP-50 header/chunking scheme unmodified. This is real,
   first-party evidence that the write payload **shape** (header `[0x11,0x4F,slot,0,0,0]` + `prst[NAME_OFF:]`,
   19-byte chunking) holds for the GP-5, corroborating it as strongly as a passive listener can — the exact
   write opcode/header bytes themselves were not directly observed (would need a true bidirectional MIDI
   sniffer, e.g. a hardware MIDI-thru/monitor, which was not available here).

**Design response**: every requirement above (R1–R13, R15) specifies `WebMidiPedalConnection`
orchestration in terms of a `SysexPresetCodec` **interface**, so behavior is fully specified, implementable,
and testable today using a **fake** codec (see "Testing approach"), independent of the real byte format.
Given points 2–4 above, `Gp5SysexPresetCodec`'s read methods (R14) and write method (R17, formerly a
blanket throwing stub) can now both be implemented for real — `T5` covers read (byte-exact confirmed) and
`T21` covers write (payload-shape corroborated per point 4, ported from the GP-50 encoding with the header/
chunking evidence above; not byte-instrumented). `R16` requires the MIT copyright/permission notice
preserved verbatim in both files' header comments, each stating precisely what was confirmed vs.
corroborated. A related, smaller unknown: the actual vocabulary of GP-5 module types (compressor, drive,
amp, cab, EQ, delay, reverb, noise gate, etc.) is unconfirmed — `PresetSlot.moduleType` stays a plain
`string` rather than a fixed union until that's mapped.

## Files to touch

- `src/app/midi/preset.ts` (new) — `Preset`, `PresetSlot` domain types (R1).
- `src/app/midi/sysex-preset-codec.ts` (new) — `SysexPresetCodec` interface, `SysexDecodeResult` type,
  `SYSEX_PRESET_CODEC` injection token (R2, R15).
- `src/app/midi/gp5-sysex-preset-codec.ts` (new) — `Gp5SysexPresetCodec` stub (R14), with the
  open-question header comment (R16).
- `src/app/midi/gp5-sysex-preset-codec.spec.ts` (new) — asserts each method throws (R14).
- `src/app/midi/pedal-connection.ts` — change `readPresets(): Promise<unknown[]>` to
  `Promise<Preset[]>` and `writePreset(preset: unknown)` to `writePreset(preset: Preset)`.
- `src/app/midi/web-midi-pedal-connection.ts` — implement `readPresets()`/`writePreset()`; inject
  `SYSEX_PRESET_CODEC`; add the pending-operation guard; extend `connect()` to also wire
  `input.onmidimessage`.
- `src/app/midi/web-midi-pedal-connection.spec.ts` — extend with the new tests below.
- `src/app/app.config.ts` — add `{ provide: SYSEX_PRESET_CODEC, useClass: Gp5SysexPresetCodec }` to
  `appConfig.providers` (R15).

## Domain types

```ts
// src/app/midi/preset.ts
export interface PresetSlot {
  // Free-form on purpose — the real GP-5 module vocabulary is unconfirmed, see design.md's
  // Open question.
  moduleType: string;
  enabled: boolean;
  parameters: Record<string, number>;
}

export interface Preset {
  slot: number;
  name: string;
  chain: PresetSlot[];
}
```

## `SysexPresetCodec` — the black-box boundary

```ts
// src/app/midi/sysex-preset-codec.ts
import { InjectionToken } from '@angular/core';
import type { Preset } from './preset';

export type SysexDecodeResult =
  | { kind: 'preset'; preset: Preset; isLast: boolean }
  | { kind: 'ignored' }
  | { kind: 'invalid'; reason: string };

export interface SysexPresetCodec {
  encodeReadAllRequest(): Uint8Array[];
  decodeIncomingMessage(message: Uint8Array): SysexDecodeResult;
  encodeWriteRequest(preset: Preset): Uint8Array[];
}

export const SYSEX_PRESET_CODEC = new InjectionToken<SysexPresetCodec>('SYSEX_PRESET_CODEC');
```

`decodeIncomingMessage` takes exactly one raw MIDI message's `data` (a `Uint8Array`, matching
`MIDIMessageEvent.data`'s type) and returns one of three outcomes — this three-way split is what lets
`WebMidiPedalConnection` implement R7/R8/R10/R11 without knowing anything about SysEx bytes itself.

## `Gp5SysexPresetCodec` — stub until the open question is resolved

```ts
// src/app/midi/gp5-sysex-preset-codec.ts
//
// SysEx byte-level protocol and source-project license: UNCONFIRMED.
// This class is a placeholder — see specs/sysex_preset_read_write/design.md's "Open question" section.
// No code has been copied or adapted from github.com/drewmerc302/valeton-gp50 in this file. Before
// implementing the methods below for real, a human must (a) confirm that project's license and record
// it here, replacing this paragraph, and (b) confirm the actual SysEx byte format — do not guess it.
import { Injectable } from '@angular/core';
import type { Preset } from './preset';
import type { SysexPresetCodec, SysexDecodeResult } from './sysex-preset-codec';

@Injectable({ providedIn: 'root' })
export class Gp5SysexPresetCodec implements SysexPresetCodec {
  encodeReadAllRequest(): Uint8Array[] {
    throw new Error('protocol_unconfirmed');
  }

  decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
    throw new Error('protocol_unconfirmed');
  }

  encodeWriteRequest(_preset: Preset): Uint8Array[] {
    throw new Error('protocol_unconfirmed');
  }
}
```

## `WebMidiPedalConnection` changes

New private state:

```ts
type PendingOperation =
  | {
      kind: 'read';
      presets: Preset[];
      resolve: (presets: Preset[]) => void;
      reject: (error: Error) => void;
      timeoutHandle: ReturnType<typeof setTimeout>;
    }
  | { kind: 'write' };

private pendingOperation: PendingOperation | null = null;
private readonly codec = inject(SYSEX_PRESET_CODEC);
```

`READ_TIMEOUT_MS = 5000` — an exported constant (like `GP5_NAME_PATTERN`), documented as a reasonable
default for a full-pedal dump, adjustable once real hardware timing is known; tests use
`vi.useFakeTimers()` to exercise R9 deterministically rather than actually waiting 5s.

`connect()` (existing method, extended): after the existing `onstatechange` wiring, add
`input.onmidimessage = (ev) => this.handleMidiMessage(ev.data);`.

`readPresets()`:
1. Guard (R3): `connectionState() !== 'connected'` → `throw new Error('not_connected')`.
2. Guard (R5): `this.pendingOperation` already set → `throw new Error('request_in_progress')`.
3. Build a `Promise<Preset[]>`, store a `{ kind: 'read', presets: [], resolve, reject, timeoutHandle }`
   record on `this.pendingOperation`, with `timeoutHandle` calling
   `reject(new Error('read_timeout'))` + clearing `this.pendingOperation` after `READ_TIMEOUT_MS`.
4. Send (R6): `for (const msg of this.codec.encodeReadAllRequest()) this.output!.send(msg);`.
5. Return the promise.

`handleMidiMessage(data: Uint8Array)`:
- If `this.pendingOperation?.kind !== 'read'` → return (R11, nothing pending to route to).
- `const result = this.codec.decodeIncomingMessage(data);`
- `result.kind === 'ignored'` → return (R11).
- `result.kind === 'invalid'` → clear the timeout, `reject(new Error('invalid_response'))`, clear
  `this.pendingOperation` (R10).
- `result.kind === 'preset'` → push `result.preset` onto `presets` (R7); if `result.isLast`, clear the
  timeout, `resolve(presets)`, clear `this.pendingOperation` (R8).

`writePreset(preset: Preset)`:
1. Guard (R4): not connected → `throw new Error('not_connected')`.
2. Guard (R5): another operation pending → `throw new Error('request_in_progress')`.
3. `this.pendingOperation = { kind: 'write', onMessage: null };`
4. Send (R12) — stop-and-wait (feature 28, rev 3): `packets = this.codec.encodeWriteRequest(preset)`; send
   `packets[0]`, wait for the pedal's reply, send `packets[1]`, … exactly as Valeton Suite does (it sends
   chunk i, waits ~1–2 ms for the ACK, then sends chunk i+1). **No slot selection (CC0 / Bank Select) is
   sent first** — the target slot is carried in the first chunk's header, and Suite sends none. (Rev 1/2
   sent `encodeSelectPreset(slot)` + a 300 ms settle and then burst all 26 packets; the pedal ACKed 3 and
   NAKed the 4th, dropping the rest — see evidence below.)
5. Wait for each reply (feature 28, amends R13): `handleMidiMessage` routes every incoming message to the
   write op while one is pending, classified by `codec.decodeWriteReply(message)`:
   - `'ack'` → send the next packet (re-arming the timer); after the last packet's ACK, resolve.
   - `'nak'` → reject with `Error('write_rejected')`; nothing further is sent.
   - `null` (e.g. the `[.., 0x12, 0x1b, ...]` patch-change notification) → ignored.
   The timer is armed before each send: no reply within `WRITE_ACK_TIMEOUT_MS` (1000 ms **per chunk**)
   rejects with `Error('write_timeout')`. A throwing `output.send` rejects with that error. Every exit
   path clears the timer and detaches the handler, so a reply that arrives while no write is pending is
   dropped. Limitation: write replies carry no chunk index, so a stray ACK from an aborted write that
   arrives *after* a new write has sent its packet 0 cannot be told apart and would be counted as that
   packet's ACK. This is unlikely (observed reply latency ~1-90 ms vs the 1000 ms timeout that must elapse
   before an abort) and accepted. The operation stays pending until then (R5) and is released on resolve
   and on reject.

**Write frame layout (feature 28).** Every write frame decodes as
`[crc, total_chunks, chunk_index, chunk_len, payload...]` — the same layout as every reply frame (see the
codec's feature 13 note). Byte 1 is the total chunk count (`WRITE_BLOCK_COUNT` = 26 for the GP-5's
488-byte payload), **not** an opcode: the GP-50 port put `0x1D` (29) there, so the GP-5 switched to the
target slot but never committed the write (presumably waiting for chunks 26..28). Header
`[0x11,0x4F,slot,0,0,0]` + `prst[NAME_OFF:]`, 19-byte chunking and CRC-8/0x07 are unchanged. This
deliberately supersedes `import_preset_to_pedal` R45's "opcode 0x1D unchanged".

**Write reply (ACK / NAK).** One frame per chunk received, decoded
`[crc, 0x01, 0x00, 0x03, 0x14, 0x08, status]` — `Gp5SysexPresetCodec.decodeWriteReply` returns `'ack'`
for status `0x00` (wire `F0 0B 02 00 01 00 00 00 03 01 04 00 08 00 00 F7`), `'nak'` for `0x01` (wire
`F0 0B 05 00 01 00 00 00 03 01 04 00 08 00 01 F7`), `null` for anything else. In the Suite capture
there are exactly 26 ACKs for 26 chunks: ACKs 1-25 arrive ~0-2 ms after chunks 0-24, but the 26th
(final) ACK arrives ~90 ms after the last chunk (20:02:32.915 -> 20:02:33.006), immediately *after* the
pedal's `12 1B 02 00 00 00` commit notification. That notification therefore arrives while the write is
still pending and is ignored as a `null` reply; `writePreset` resolves on the 26th ACK that follows it.
The ~90 ms final-ACK latency (the commit) is what the 1000 ms per-chunk timeout must cover.

Evidence: `progress/gp5_suite_write_capture_2.txt` (spy-driver capture of Valeton Suite importing a
preset, both directions: frames byte-identical in format to ours, byte 1 = `0x1A`, one chunk per ACK, no
Bank Select), `progress/gp5_app_write_capture.txt` (our rev-2 burst: CC0, then 26 chunks in ~15 ms → 3
ACKs then a NAK), `progress/gp5_suite_write_capture.txt` (round 1, pedal replies only) and the analysis
`progress/analysis_suite_write_capture.md` ("Round 2").

## Error handling

Matches `docs/architecture.md` principle 3: `PedalConnection` methods throw stable string-keyed errors
(`'not_connected'`, `'request_in_progress'`, `'read_timeout'`, `'invalid_response'`,
`'protocol_unconfirmed'`, `'write_timeout'`, `'write_rejected'` — feature 28), never an unhandled rejection — callers (a future preset-browser page, out of
scope here) catch and map to a translated message, same pattern `PedalConnectionPage` already
establishes for `connect()`'s errors.

## Testing approach

- `web-midi-pedal-connection.spec.ts` gets a **fake `SysexPresetCodec`** (plain object implementing the
  three methods, returning scripted `SysexDecodeResult`s) provided via constructor/DI override — this
  lets every orchestration requirement (R3–R13) be tested without any real SysEx bytes:
  - not-connected rejection for both methods, asserting `output.send` was never called (R3, R4).
  - concurrent-call rejection in both directions (R5).
  - `output.send` called once per message from `encodeReadAllRequest()`/`encodeWriteRequest()`, in order
    (R6, R12).
  - simulating `input.onmidimessage` firing with scripted decode results: accumulates in order (R7),
    resolves on `isLast` (R8), ignores `'ignored'` results without side effects (R11), rejects on
    `'invalid'` (R10).
  - `vi.useFakeTimers()` + advancing past `READ_TIMEOUT_MS` with no `isLast` message → `read_timeout`
    (R9).
  - `writePreset()` is stop-and-wait (R13 as amended by feature 28): packet i+1 is not sent until ACK i;
    resolves after the last ACK, not one fewer; a NAK rejects `write_rejected` with no further sends; a
    missing ACK rejects `write_timeout` after `WRITE_ACK_TIMEOUT_MS`; unrelated frames ignored; no CC0
    sent; a late ACK arriving while no write is pending is dropped.
  - `gp5-sysex-preset-codec.spec.ts`: `decodeWriteReply` on the exact captured ACK/NAK wire bytes.
  - an end-to-end **round-trip test** using a fake codec backed by an in-memory `Map<number, Preset>`
    (write encodes/stores, read decodes/emits from the map): `writePreset(preset)` then `readPresets()`
    returns a list containing that same `preset` — this is the concrete test satisfying acceptance
    criterion 2 ("write, read back, matches") without needing the real protocol.
- `gp5-sysex-preset-codec.spec.ts` (new, plain Vitest): each of the three methods throws
  `'protocol_unconfirmed'` (R14).

## Discarded alternatives

1. **Have `writePreset()` wait for an explicit write-acknowledgement message from the pedal** (mirroring
   how `readPresets()` awaits an `isLast` message) instead of resolving immediately after sending.
   **Rejected**: whether the real GP-5 protocol sends any write ack at all is part of the unconfirmed
   protocol (see "Open question") — designing a wait-for-ack state machine now risks encoding a
   handshake that doesn't exist on real hardware. The acceptance criteria's round-trip requirement
   ("write, read back, matches") is satisfiable by a caller-level write-then-read test without the write
   call itself blocking on an ack.
   - **2026-10-06 — reversed by feature 28 (`write_pacing_fix`).** A capture of the GP-5's replies during a
     Valeton Suite import (`progress/gp5_suite_write_capture.txt`) shows the pedal does send one ACK per
     chunk, so `writePreset()` now waits for them (step 5 above). Rev 3: one chunk per ACK (stop-and-wait),
     matching Suite's outgoing traffic in `progress/gp5_suite_write_capture_2.txt`.
2. **Model `Preset` as the raw `Uint8Array` SysEx payload** instead of a decoded domain object with typed
   slots/parameters. **Rejected**: `docs/architecture.md` keeps `src/app/midi/` as the only place that
   speaks the wire protocol; exposing raw bytes to callers (a future preset-browser page) would leak the
   SysEx format across the `PedalConnection` boundary and require every caller to understand it,
   defeating the point of the codec abstraction.
   - **2026-10-05 — partial reversal completed by F5 (`import_preset_to_pedal`).** F4 added an optional
     `Preset.raw` (`{ body: 466 bytes, nameField: 16 bytes }`); F5 completes the reversal by branching
     `encodeWriteRequest` on `preset.raw` — when `raw.body.length === 466` the bytes are copied into the
     write payload verbatim, the same way `encodePrstFile` already uses them on the upload path. A saved
     preset now round-trips byte-identical: upload → save in the library → fetch the `.prst` → write
     it back to a slot, the resulting bytes are the bytes the user originally read. `encodeBody` is
     kept as the no-`raw` fallback so the path is still self-contained for callers that have not (yet)
     captured the pedal's bytes.
3. **Hardcode `new Gp5SysexPresetCodec()` inside `WebMidiPedalConnection`** instead of injecting
   `SysexPresetCodec` through a token. **Rejected**: this feature's own tests need a fake codec to
   exercise `readPresets()`/`writePreset()`'s orchestration logic (timeout, accumulation, invalid/ignored
   handling) without depending on the still-unconfirmed byte-level protocol — this mirrors
   `specs/webmidi_gp5_connection/design.md`'s discarded alternative #2 (keeping `PedalConnection` an
   interface for the same swap-for-testing reason), one layer deeper.

## Out of scope

- The real `Gp5SysexPresetCodec` byte-level implementation and its license header (R14/R16's throwing
  stub is in scope; the real logic is blocked — see "Open question" and `tasks.md`'s `T5`).
- Any UI for browsing, saving, or importing presets — `preset_browser_ui`, `save_preset_dialog`,
  `import_preset_to_pedal` features.
- Bank/slot-selector UI — `pedal_bank_selector_ui` feature.
- Retrying a failed read/write, or any backoff policy — not in the acceptance criteria.
