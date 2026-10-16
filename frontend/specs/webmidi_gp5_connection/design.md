# Design — webmidi_gp5_connection

## Open question — needs human confirmation before implementation starts

**The exact string the Valeton GP-5 reports as its MIDI port name (via the browser's `MIDIPort.name`,
sourced from the USB MIDI device's product-name descriptor) is not documented anywhere in this repo,**
and this session had no way to check it against real hardware or the vendor's own driver docs. The repo
does confirm the *device* (GP-5, Valeton) and the *reverse-engineered SysEx project* to port later
(`github.com/drewmerc302/valeton-gp50`, see feature `sysex_preset_read_write`), but neither names the
literal MIDI port string.

**Assumption made for this design** (see "GP-5 device identification" below): match case-insensitively
against the regex `/gp[\s-]?5/i`, i.e. any port name containing `gp5`, `gp-5`, or `gp 5` in any casing
("GP-5", "GP5", "Valeton GP-5", "GP-5 MIDI 1", etc.). This is deliberately permissive rather than an
exact-string match, precisely because the real string is unconfirmed.

**Before `T2`/`T6` (see `tasks.md`) are implemented against real hardware**, whoever does the manual
verification pass (acceptance criterion 3: "Manually verified against a real GP-5 over USB in Chrome or
Firefox") should confirm the actual port name(s) Chrome/Firefox report for the GP-5 (e.g. via
`(await navigator.requestMIDIAccess()).inputs`) and either confirm the regex still matches or update
`GP5_NAME_PATTERN` to match reality. This does not block starting implementation — the regex is a
reasonable default and the whole feature is already gated on manual hardware verification per its own
acceptance criteria — but it does mean `GP5_NAME_PATTERN` should be treated as provisional until that
verification happens, not as a confirmed constant.

## Files to touch

- `src/app/midi/pedal-connection.ts` — add and export `PedalConnectionState`. The `PedalConnection`
  interface itself is unchanged (see "Discarded alternatives" below for why `connectionState` does not
  move onto it).
- `src/app/midi/web-midi-pedal-connection.ts` — implement `connect()`; add the `connectionState` signal,
  the `GP5_NAME_PATTERN` constant, and the port-matching/disconnect-handling logic. Becomes
  `@Injectable({ providedIn: 'root' })` (see below) but keeps working with a bare `new
  WebMidiPedalConnection()` too, since it has no constructor-injected dependencies — the existing
  `isSupported()` tests that construct it directly keep passing unmodified.
- `src/app/midi/web-midi-pedal-connection.spec.ts` — add `connect()` tests (state transitions, port
  matching, error paths, disconnect handling).
- `src/app/pedals/pedal-connection-page/pedal-connection-page.ts` + `.html` (new folder — this is the
  first thing in `src/app/pedals/`, matching `docs/architecture.md`'s "future `src/app/pedals/`" note) —
  the minimal connection-state UI.
- `src/app/pedals/pedal-connection-page/pedal-connection-page.spec.ts` (new) — `TestBed`-based tests.
- `src/app/app.routes.ts` — add a guarded `pedal` route, lazy-loaded, mirroring the existing `songs`
  route's shape.
- `public/i18n/en.json`, `public/i18n/es.json` — add a new `pedal` namespace.

## `PedalConnectionState` and where it lives

```ts
// src/app/midi/pedal-connection.ts
export type PedalConnectionState = 'not-connected' | 'connecting' | 'connected' | 'error';
```

Kebab-case string literals (not `'not connected'` with a space, as the feature's free-text acceptance
criteria phrase it) — consistent with this codebase's kebab-case file-naming convention
(`docs/conventions.md`) and safe to use directly as part of an i18n key or CSS class without escaping.

## `WebMidiPedalConnection` shape

```ts
// src/app/midi/web-midi-pedal-connection.ts
import { Injectable, signal } from '@angular/core';
import type { PedalConnection, PedalConnectionState } from './pedal-connection';

// See specs/webmidi_gp5_connection/design.md — "Open question" section. Provisional until confirmed
// against real hardware.
export const GP5_NAME_PATTERN = /gp[\s-]?5/i;

@Injectable({ providedIn: 'root' })
export class WebMidiPedalConnection implements PedalConnection {
  private readonly stateSignal = signal<PedalConnectionState>('not-connected');
  readonly connectionState = this.stateSignal.asReadonly();

  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('unsupported');
    }
    this.stateSignal.set('connecting');

    let access: MIDIAccess;
    try {
      access = await navigator.requestMIDIAccess({ sysex: true });
    } catch {
      this.stateSignal.set('error');
      throw new Error('midi_access_denied');
    }

    const input = this.findGp5Port(access.inputs);
    const output = this.findGp5Port(access.outputs);
    if (!input || !output) {
      this.stateSignal.set('error');
      throw new Error('gp5_not_found');
    }

    this.input = input;
    this.output = output;
    input.onstatechange = () => this.handlePortStateChange();
    output.onstatechange = () => this.handlePortStateChange();
    this.stateSignal.set('connected');
  }

  async readPresets(): Promise<unknown[]> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }

  async writePreset(_preset: unknown): Promise<void> {
    throw new Error('not implemented yet — see the sysex_preset_read_write feature');
  }

  private findGp5Port<T extends MIDIInput | MIDIOutput>(
    ports: ReadonlyMap<string, T>,
  ): T | null {
    for (const port of ports.values()) {
      if (GP5_NAME_PATTERN.test(port.name ?? '')) return port;
    }
    return null;
  }

  private handlePortStateChange(): void {
    if (this.stateSignal() !== 'connected') return;
    if (this.input?.state === 'disconnected' || this.output?.state === 'disconnected') {
      this.input = null;
      this.output = null;
      this.stateSignal.set('not-connected');
    }
  }
}
```

`MIDIAccess`/`MIDIInput`/`MIDIOutput`/`MIDIOptions` types come from TypeScript's own `lib.dom.d.ts`
(confirmed present in this repo's `typescript` version, `~6.0.2`) — no extra `@types` package needed.

`access.inputs`/`access.outputs` are `MIDIInputMap`/`MIDIOutputMap`, both of which are
`ReadonlyMap<string, MIDIInput | MIDIOutput>`-shaped (support `.values()`), so `findGp5Port` works for
both without duplicating the loop.

Error messages thrown by `connect()` are stable keys (`'unsupported'`, `'midi_access_denied'`,
`'gp5_not_found'`), not user-facing text — this mirrors the existing `LoginPage`/`RegisterPage` pattern
(`docs/conventions.md`'s Error Handling section): a page component catches, does
`this.error.set(err.message)`, and the template does `t('pedal.' + error())`, keeping every user-facing
string behind Transloco rather than hardcoded in the service.

## Connection-state page

```ts
// src/app/pedals/pedal-connection-page/pedal-connection-page.ts
import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { PedalConnectionState } from '../../midi/pedal-connection';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';

const STATE_LABEL_KEYS: Record<PedalConnectionState, string> = {
  'not-connected': 'state_not_connected',
  connecting: 'state_connecting',
  connected: 'state_connected',
  error: 'state_error',
};

@Component({
  selector: 'app-pedal-connection-page',
  imports: [TranslocoDirective],
  templateUrl: './pedal-connection-page.html',
})
export class PedalConnectionPage {
  private readonly pedal = inject(WebMidiPedalConnection);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly stateLabelKey = computed(() => STATE_LABEL_KEYS[this.connectionState()]);
  readonly error = signal<string | null>(null);
  readonly connecting = computed(() => this.connectionState() === 'connecting');

  async connect(): Promise<void> {
    this.error.set(null);
    try {
      await this.pedal.connect();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'unknown');
    }
  }
}
```

Template (`pedal-connection-page.html`) follows the same shape as `songs-page.html`/`login-page.html`:
`*transloco="let t"`, Tailwind utility classes only, an `@if (!supported)` branch rendering
`t('pedal.unsupported')` instead of the connect control (R12), otherwise a button (`(click)="connect()"`,
`[disabled]="connecting()"`) plus `t('pedal.' + stateLabelKey())` and, when `error()` is set,
`t('pedal.' + error())` in the same red-text style `login-page.html` uses for `auth.login_error`.

Route (`app.routes.ts`), inserted after `songs`, same guard:

```ts
{
  path: 'pedal',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./pedals/pedal-connection-page/pedal-connection-page').then((m) => m.PedalConnectionPage),
},
```

`public/i18n/{en,es}.json` gain a `pedal` namespace: `title`, `connect`, `state_not_connected`,
`state_connecting`, `state_connected`, `state_error`, `unsupported`, `midi_access_denied`,
`gp5_not_found` — every key `t()` is called with above, in both languages (`docs/conventions.md`'s
hard rule that every UI string goes through Transloco with both an `es` and `en` entry).

## Error handling

Matches `docs/architecture.md` principle 3 exactly: `PedalConnection` methods throw; the only caller in
this feature (`PedalConnectionPage.connect()`) catches and turns the thrown `Error`'s `message` into the
signal-based `error` state shown in the template — never an unhandled promise rejection. The
`isSupported()` check inside `connect()` (R2) is a defensive fail-fast for the connect() call itself;
the page's own `@if (!supported)` gate (R12) is the primary, expected UX path a real user hits on an
unsupported browser, per `docs/architecture.md`'s explicit "always check `isSupported()` first" rule. A
richer/shared unsupported-browser component (e.g. reused across other pedal-connection screens) is the
`unsupported_browser_fallback_ui` feature's job, not this one's — this feature's inline message is
enough to satisfy R12 and the architecture rule without pre-building that feature's UI.

## Testing approach

- `WebMidiPedalConnection.connect()` tests (`web-midi-pedal-connection.spec.ts`, plain Vitest, no
  `TestBed`, matching the existing `isSupported()` tests): `vi.stubGlobal('navigator', { requestMIDIAccess:
  vi.fn() })`, with the mock resolving/rejecting a fake `MIDIAccess`-shaped object whose `inputs`/
  `outputs` are real `Map`s of fake port objects (`{ name, state, onstatechange }`) — real `Map`s satisfy
  `findGp5Port`'s `.values()` usage without needing to stub the whole `MIDIInputMap` interface.
- `PedalConnectionPage` tests (`TestBed.configureTestingModule`, reusing `appConfig.providers` per
  `docs/conventions.md`) override `WebMidiPedalConnection` with a fake implementing just
  `isSupported()`/`connect()`/`connectionState`, to test the two UI branches (R11/R12) and the error
  message without going through the real Web MIDI stubbing again.

## Discarded alternatives

1. **Wait/poll for the GP-5 to appear later** (keep `connect()`'s promise pending, listening for
   `MIDIAccess.onstatechange`, resolving whenever a matching port eventually shows up) instead of a
   single snapshot check of `inputs`/`outputs` right after `requestMIDIAccess` resolves. **Rejected**:
   the acceptance criteria only require `connect()` to resolve "once the GP-5 is found among the
   available devices" — the natural reading is the currently-enumerated set, not an indefinite wait. An
   unbounded-wait design would need its own timeout/cancellation semantics that nothing in the
   acceptance criteria asks for; the simpler synchronous check lets the caller just retry `connect()`
   after plugging the pedal in, and is far easier to unit-test deterministically.
2. **Put `connectionState` directly on the `PedalConnection` interface** instead of only on the concrete
   `WebMidiPedalConnection` class. **Rejected**: `docs/architecture.md` explicitly frames
   `PedalConnection` as mirroring the backend's `StorageAdapter` swap pattern, growing only what's
   actually needed — today there is exactly one implementation and no second one (`NativeCoreMidiPedalConnection`,
   `ElectronPedalConnection`) has been built, so adding an Angular-signal-typed member to the
   interface now would be speculative. If/when a second implementation lands, promoting
   `connectionState` onto the interface then is a small, mechanical change.
3. **Exact-string match** (e.g. `port.name === 'GP-5'`) instead of the permissive
   `GP5_NAME_PATTERN` regex for device identification. **Rejected**: per the "Open question" section
   above, the literal string the GP-5 reports over USB MIDI is unconfirmed against real hardware in this
   session, and USB MIDI port names are known to vary by OS/driver (e.g. a "Valeton GP-5" prefix, or an
   OS-appended port index like "GP-5 MIDI 1"). An exact match risks silently never finding the pedal on
   some platform; the regex is deliberately permissive and is called out as provisional pending the
   manual hardware verification the feature's acceptance criteria already require.

## Out of scope

- `readPresets()`/`writePreset()` (the SysEx protocol) — `sysex_preset_read_write` feature.
- A shared/reusable unsupported-browser component, and gating *every* pedal-connection screen (not just
  this one page) on `isSupported()` — `unsupported_browser_fallback_ui` feature.
- Any user-triggered "disconnect" action, reconnect/retry backoff, or persisting the last-connected
  device across page loads — none of this is in the acceptance criteria; R9 only covers detecting an
  unplug event that happens while already connected.
