import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { Injectable, Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SongsApi } from '../songs-api.service';
import { environment } from '../../../environments/environment';
import { WriteToPedalDialog } from './write-to-pedal-dialog';
import { capturedBodyBytes } from '../../midi/gp5-captured-bodies.fixture';
import { encodePrstFile } from '../../midi/gp5-prst-file';
import { decodeGp5Body, NAME_LEN } from '../../midi/gp5-sysex-preset-codec';
import type { Preset } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { SYSEX_PRESET_CODEC } from '../../midi/sysex-preset-codec';
import { Gp5SysexPresetCodec } from '../../midi/gp5-sysex-preset-codec';
import type { Song, SongPreset } from '../song';
import type { WriteablePresetRef } from '../write-preset-form';

function buildPrstBytes(name: string, body: Uint8Array, nameField: Uint8Array): Uint8Array {
  const chain = decodeGp5Body(body, name, 0).chain;
  const preset: Preset = { slot: 0, name, chain, raw: { body, nameField } };
  return encodePrstFile(preset);
}

function makeNameField(name: string): Uint8Array {
  const f = new Uint8Array(NAME_LEN);
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < NAME_LEN; i++) f[i] = i < enc.length ? enc[i] : 0;
  return f;
}

function makeSong(): Song {
  const presets: SongPreset[] = [
    { id: 'p0', sortOrder: 0, name: 'TL DLX AMP' },
    { id: 'p1', sortOrder: 1, name: 'Lead Solo' },
  ];
  return { id: 'song-7', name: 'Lead Tones', presets };
}

function makeRefs(): WriteablePresetRef[] {
  return [
    { songId: 'song-7', sortOrder: 0, presetId: 'p0', name: 'TL DLX AMP', position: 1 },
    { songId: 'song-7', sortOrder: 1, presetId: 'p1', name: 'Lead Solo', position: 2 },
  ];
}

const minimalTranslations: Translation = {
  writeToPedal: {
    title: 'Send to pedal',
    close: 'Cerrar',
    song_heading: 'Canción: «{{name}}»',
    presets_legend: 'Presets',
    preset_row_aria: 'Posición {{position}}: {{name}}',
    target_slot: 'Slot de destino',
    write_all: 'Escribir todos en orden',
    write_all_help: 'Envía los presets a slots consecutivos.',
    not_connected: 'Conecta el GP-5 para escribir.',
    connect: 'Conectar GP-5',
    connecting: 'Conectando…',
    cancel: 'Cancelar',
    send: 'Enviar',
    writing: 'Enviando…',
    success_title: 'Listo',
    success_single: '«{{presetName}}» en slot {{toSlot}}.',
    success_multi: '{{count}} presets en {{from}}..{{to}}.',
    partialProgress: 'Ya escribimos: {{slots}}.',
    done: 'Cerrar',
    login_link: 'Iniciar sesión',
    errors: {
      pedalDisconnected: 'Pedal desconectado.',
      busy: 'Pedal ocupado.',
      timeout: 'Pedal no respondió.',
      connectionLost: 'Conexión perdida.',
      unexpected: 'Error.',
      songNotFound: 'Canción no encontrada.',
      sessionExpired: 'Sesión caducada.',
      network: 'Error de red.',
      corruptFile: 'Archivo dañado.',
      writeNotConfirmed: 'Escritura no confirmada.',
      writeRejected: 'Escritura rechazada.',
    },
  },
  writeToSlot: {
    help: '0..99',
    errors: {
      outOfRange: 'Fuera de rango.',
      notEnoughRoom: 'No caben {{N}} presets (quedan {{available}}).',
    },
    summary_range: 'Slots {{from}}..{{to}} — {{count}} presets',
  },
};

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of(minimalTranslations);
  }
}

@Component({
  selector: 'host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <app-write-to-pedal-dialog
        [song]="song()"
        [presets]="presets()"
        (closed)="onClosed()"
      />
    }
  `,
  imports: [WriteToPedalDialog],
})
class Host {
  readonly song = signal<Song>({ id: 'song-default', name: 'default', presets: [] });
  readonly presets = signal<readonly WriteablePresetRef[]>([]);
  readonly show = signal<boolean>(false);
  closedCount = 0;
  open(s: Song, p: readonly WriteablePresetRef[]): void {
    this.song.set(s);
    this.presets.set(p);
    this.show.set(true);
  }
  onClosed(): void {
    this.closedCount++;
    this.show.set(false);
  }
}

function setupTestBed() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: {
          availableLangs: ['es'],
          defaultLang: 'es',
          fallbackLang: 'es',
        },
        loader: StubTranslocoLoader,
      }),
      { provide: SYSEX_PRESET_CODEC, useClass: Gp5SysexPresetCodec },
    ],
  });
}

describe('WriteToPedalDialog (F5 R3, R4, R15-R19, R20-R24, R25, R28-R41, R51, R52)', () => {
  let host: Host;
  let httpMock: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  beforeEach(() => {
    setupTestBed();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  test('opens with the song heading, preset list, target-slot picker, and disabled Send button when not connected (R3, R25)', async () => {
    host.open(makeSong(), makeRefs());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="write-to-pedal-card"]')).toBeTruthy();
    expect(
      root.querySelector('[data-testid="write-to-pedal-song-heading"]')?.textContent,
    ).toContain('Lead Tones');
    const rows = root.querySelectorAll('[data-testid="write-to-pedal-preset-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('aria-label')).toContain('TL DLX AMP');
    const slot = root.querySelector<HTMLInputElement>('[data-testid="write-to-pedal-slot-input"]');
    expect(slot).toBeTruthy();
    expect(slot!.value).toBe('0');
    expect(slot!.getAttribute('inputmode')).toBe('numeric');
    expect(slot!.getAttribute('pattern')).toBe('[0-9]*');
    const send = root.querySelector<HTMLButtonElement>('[data-testid="write-to-pedal-submit"]');
    expect(send).toBeTruthy();
    expect(send!.disabled).toBe(true);
    expect(
      root.querySelector('[data-testid="write-to-pedal-not-connected"]')?.textContent,
    ).toBeTruthy();
  });

  test('renders the "Connect GP-5" button inside the not-connected reminder and invokes pedal.connect() on click (patch 2026-10-06, R25/R26)', async () => {
    TestBed.resetTestingModule();
    setupTestBed();
    const connectSpy = vi.fn().mockResolvedValue(undefined);
    const stubPedal = {
      connectionState: signal<'not-connected' | 'connecting' | 'connected' | 'error'>('not-connected'),
      connect: connectSpy,
      writePreset: vi.fn().mockResolvedValue(undefined),
    } as unknown as WebMidiPedalConnection;
    TestBed.overrideProvider(WebMidiPedalConnection, { useValue: stubPedal });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    host.open(makeSong(), makeRefs());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const connectBtn = root.querySelector<HTMLButtonElement>('[data-testid="write-to-pedal-connect"]');
    expect(connectBtn).toBeTruthy();
    expect(connectBtn!.textContent?.trim()).toBe('Conectar GP-5');
    expect(connectBtn!.disabled).toBe(false);

    connectBtn!.click();
    await fixture.whenStable();

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('preserves the design palette (R51, R52): backdrop, card, picker, submit, and failure banner carry the expected classes (and their dark: counterparts)', async () => {
    host.open(makeSong(), makeRefs());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const backdrop = root.querySelector('[data-testid="write-to-pedal-backdrop"]')!;
    expect(backdrop.className).toContain('bg-slate-900/40');
    expect(backdrop.className).toContain('p-4');
    expect(backdrop.className).toContain('z-50');

    const card = root.querySelector('[data-testid="write-to-pedal-card"]')!;
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('bg-white');
    expect(card.className).toContain('dark:bg-slate-800');
    expect(card.className).toContain('max-w-md');

    const slot = root.querySelector('[data-testid="write-to-pedal-slot-input"]')!;
    expect(slot.className).toContain('border-slate-300');
    expect(slot.className).toContain('bg-white');
    expect(slot.className).toContain('dark:border-slate-600');
    expect(slot.className).toContain('dark:bg-slate-900');

    const send = root.querySelector('[data-testid="write-to-pedal-submit"]')!;
    expect(send.className).toContain('bg-indigo-600');
    expect(send.className).toContain('disabled:cursor-not-allowed');
    expect(send.className).toContain('disabled:opacity-50');
    expect(send.className).toContain('focus-visible:outline-indigo-600');
  });

  test('picker has aria-describedby pointing at the help line (R19)', async () => {
    host.open(makeSong(), makeRefs());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const slot = root.querySelector('[data-testid="write-to-pedal-slot-input"]')!;
    expect(slot.getAttribute('aria-describedby')).toBe('write-to-pedal-slot-help');
    const help = root.querySelector('#write-to-pedal-slot-help')!;
    expect(help.textContent).toBeTruthy();
  });

  test('Send button stays disabled and shows the writing label while submitting (R31)', async () => {
    TestBed.resetTestingModule();
    setupTestBed();
    const stubPedal = {
      connectionState: signal<'not-connected' | 'connecting' | 'connected' | 'error'>('connected'),
      writePreset: async (_: Preset): Promise<void> => {
        return new Promise(() => {});
      },
    } as unknown as WebMidiPedalConnection;
    TestBed.overrideProvider(WebMidiPedalConnection, { useValue: stubPedal });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    host.open(makeSong(), makeRefs());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    let root = fixture.nativeElement as HTMLElement;
    const send = root.querySelector<HTMLButtonElement>('[data-testid="write-to-pedal-submit"]')!;
    expect(send.disabled).toBe(false);
    send.click();
    fixture.detectChanges();

    root = fixture.nativeElement as HTMLElement;
    const submitting = root.querySelector<HTMLButtonElement>('[data-testid="write-to-pedal-submit"]')!;
    expect(submitting.textContent?.trim()).toBe('Enviando…');
    expect(submitting.disabled).toBe(true);
    expect(root.querySelector('[data-testid="write-to-pedal-submitting"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="write-to-pedal-presets"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="write-to-pedal-slot-input"]')).toBeTruthy();
  });

});

// ---------------------------------------------------------------------------
// Submit pipeline (review fixes 2026-10-07). `SongsApi` and the pedal are
// stubbed through `TestBed.overrideProvider`, so no HTTP or Web MIDI is
// involved: `getSongPreset` / `writePreset` are plain `vi.fn()` mocks.
// ---------------------------------------------------------------------------

type ConnState = 'not-connected' | 'connecting' | 'connected' | 'error';

const PRESET_NAMES = ['TL DLX AMP', 'Lead Solo', 'Clean Verb'];

// One valid 507-byte .prst per sortOrder, each with a different captured body.
function prstFor(sortOrder: number): Uint8Array {
  const name = PRESET_NAMES[sortOrder] ?? `Preset ${sortOrder}`;
  return buildPrstBytes(name, capturedBodyBytes(sortOrder), makeNameField(name));
}

function makeSong3(): Song {
  return {
    id: 'song-9',
    name: 'Three Tones',
    presets: PRESET_NAMES.map((name, i) => ({ id: `p${i}`, sortOrder: i, name })),
  };
}

function makeRefs3(): WriteablePresetRef[] {
  return PRESET_NAMES.map((name, i) => ({
    songId: 'song-9',
    sortOrder: i,
    presetId: `p${i}`,
    name,
    position: i + 1,
  }));
}

interface Harness {
  fixture: ReturnType<typeof TestBed.createComponent<Host>>;
  host: Host;
  conn: ReturnType<typeof signal<ConnState>>;
  getSongPreset: ReturnType<typeof vi.fn>;
  writePreset: ReturnType<typeof vi.fn>;
  root: () => HTMLElement;
  q: <T extends HTMLElement = HTMLElement>(testId: string) => T | null;
  qa: (testId: string) => HTMLElement[];
  settle: () => Promise<void>;
  setSlot: (value: string) => Promise<void>;
}

async function mountStubbed(opts: {
  state?: ConnState;
  song?: Song;
  refs?: readonly WriteablePresetRef[];
  getSongPreset?: ReturnType<typeof vi.fn>;
  writePreset?: ReturnType<typeof vi.fn>;
}): Promise<Harness> {
  TestBed.resetTestingModule();
  setupTestBed();
  const conn = signal<ConnState>(opts.state ?? 'connected');
  const getSongPreset =
    opts.getSongPreset ??
    vi.fn((_songId: string, sortOrder: number) => Promise.resolve(prstFor(sortOrder)));
  const writePreset = opts.writePreset ?? vi.fn().mockResolvedValue(undefined);
  TestBed.overrideProvider(WebMidiPedalConnection, {
    useValue: { connectionState: conn, connect: vi.fn(), writePreset },
  });
  TestBed.overrideProvider(SongsApi, { useValue: { getSongPreset } });
  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  host.open(opts.song ?? makeSong(), opts.refs ?? makeRefs());
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await new Promise<void>((r) => setTimeout(r, 0));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();
  const root = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
    root().querySelector<T>(`[data-testid="${testId}"]`);
  const qa = (testId: string) =>
    Array.from(root().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  const setSlot = async (value: string): Promise<void> => {
    const input = q<HTMLInputElement>('write-to-pedal-slot-input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  return { fixture, host, conn, getSongPreset, writePreset, root, q, qa, settle, setSlot };
}

function sendButton(h: Harness): HTMLButtonElement {
  return h.q<HTMLButtonElement>('write-to-pedal-submit')!;
}

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('WriteToPedalDialog submit pipeline (F5 R8-R14, R28-R30, R34, R36-R41)', () => {
  test('R13/R14/R28 — single mode fetches the picked preset once and writes it once to slot M with raw.body/raw.nameField from the .prst', async () => {
    const h = await mountStubbed({});
    await h.setSlot('7');
    expect(sendButton(h).disabled).toBe(false);
    sendButton(h).click();
    await h.settle();

    expect(h.getSongPreset).toHaveBeenCalledTimes(1);
    expect(h.getSongPreset).toHaveBeenCalledWith('song-7', 0);
    expect(h.writePreset).toHaveBeenCalledTimes(1);
    const preset = h.writePreset.mock.calls[0]![0] as Preset;
    const bytes = prstFor(0);
    expect(preset.slot).toBe(7);
    expect(preset.name).toBe('TL DLX AMP');
    expect(preset.chain.length).toBeGreaterThan(0);
    expect(preset.raw).toBeDefined();
    expect(preset.raw!.body.length).toBe(466);
    expect(preset.raw!.nameField.length).toBe(16);
    expect(Array.from(preset.raw!.body)).toEqual(Array.from(bytes.subarray(0x29, 0x29 + 466)));
    expect(Array.from(preset.raw!.nameField)).toEqual(Array.from(bytes.subarray(0x19, 0x29)));
  });

  test('R36 — single success replaces the form with success_single, one unique Close button, focused', async () => {
    const h = await mountStubbed({});
    await h.setSlot('7');
    sendButton(h).click();
    await h.settle();
    await h.settle();

    const success = h.q('write-to-pedal-success')!;
    expect(success).toBeTruthy();
    expect(success.textContent).toContain('«TL DLX AMP» en slot 7.');
    expect(h.q('write-to-pedal-slot-input')).toBeNull();
    expect(h.q('write-to-pedal-submit')).toBeNull();
    const closes = h.qa('write-to-pedal-close');
    expect(closes.length).toBe(1);
    expect(closes[0]!.textContent?.trim()).toBe('Cerrar');
    expect(document.activeElement).toBe(closes[0]);
    closes[0]!.click();
    await h.settle();
    expect(h.host.closedCount).toBe(1);
  });

  test('single mode sends the row the user picked, matched by sortOrder (not by array index)', async () => {
    const refs: WriteablePresetRef[] = [
      { songId: 'song-7', sortOrder: 3, presetId: 'p3', name: 'TL DLX AMP', position: 1 },
      { songId: 'song-7', sortOrder: 5, presetId: 'p5', name: 'Lead Solo', position: 2 },
    ];
    const h = await mountStubbed({
      refs,
      getSongPreset: vi.fn(() => Promise.resolve(prstFor(1))),
    });
    h.qa('write-to-pedal-preset-row')[1]!.click();
    await h.settle();
    sendButton(h).click();
    await h.settle();
    expect(h.getSongPreset).toHaveBeenCalledWith('song-7', 5);
  });

  test('R29/R30/R38 — multi mode writes M..M+N-1 in sortOrder order, each fetch starting only after the previous write settles', async () => {
    const events: string[] = [];
    const writes: ReturnType<typeof deferred>[] = [];
    const getSongPreset = vi.fn((_id: string, sortOrder: number) => {
      events.push(`fetch:${sortOrder}`);
      return Promise.resolve(prstFor(sortOrder));
    });
    const writePreset = vi.fn((p: Preset) => {
      events.push(`write:${p.slot}`);
      const d = deferred();
      writes.push(d);
      return d.promise;
    });
    const h = await mountStubbed({ song: makeSong3(), refs: makeRefs3(), getSongPreset, writePreset });
    h.q<HTMLButtonElement>('write-to-pedal-write-all')!.click();
    await h.setSlot('10');
    sendButton(h).click();
    await h.settle();

    expect(events).toEqual(['fetch:0', 'write:10']);
    writes[0]!.resolve();
    await h.settle();
    expect(events).toEqual(['fetch:0', 'write:10', 'fetch:1', 'write:11']);
    writes[1]!.resolve();
    await h.settle();
    expect(events).toEqual(['fetch:0', 'write:10', 'fetch:1', 'write:11', 'fetch:2', 'write:12']);
    expect(h.q('write-to-pedal-success')).toBeNull();
    writes[2]!.resolve();
    await h.settle();

    const names = writePreset.mock.calls.map((c) => (c[0] as Preset).name);
    expect(names).toEqual(PRESET_NAMES);
    expect(h.q('write-to-pedal-success')?.textContent).toContain('3 presets en 10..12.');
  });

  test.each([
    ['not_connected', 'Pedal desconectado.'],
    ['request_in_progress', 'Pedal ocupado.'],
    ['read_timeout', 'Pedal no respondió.'],
    ['write_timeout', 'Escritura no confirmada.'],
    ['write_rejected', 'Escritura rechazada.'],
    ['something_else', 'Error.'],
  ])('R37/R41 — writePreset rejecting with %s keeps the form, shows the mapped failure and re-enables Send', async (message, text) => {
    const writePreset = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValue(undefined);
    const h = await mountStubbed({ writePreset });
    await h.setSlot('4');
    sendButton(h).click();
    await h.settle();

    const failure = h.q('write-to-pedal-failure')!;
    expect(failure.textContent).toContain(text);
    expect(h.q('write-to-pedal-partial')).toBeNull();
    expect(h.q('write-to-pedal-presets')).toBeTruthy();
    expect(h.q<HTMLInputElement>('write-to-pedal-slot-input')!.value).toBe('4');
    expect(h.q('write-to-pedal-write-all')).toBeTruthy();
    expect(h.q('write-to-pedal-success')).toBeNull();
    expect(sendButton(h).disabled).toBe(false);

    // Retry from the form: the failure clears and the write succeeds.
    sendButton(h).click();
    await h.settle();
    expect(h.writePreset).toHaveBeenCalledTimes(2);
    expect(h.q('write-to-pedal-failure')).toBeNull();
    expect(h.q('write-to-pedal-success')).toBeTruthy();
  });

  test('R39/R40 — a rejection on item 2 of 3 stops the sequence and lists the slot already written', async () => {
    const writePreset = vi.fn((p: Preset) =>
      p.slot === 21 ? Promise.reject(new Error('request_in_progress')) : Promise.resolve(),
    );
    const h = await mountStubbed({ song: makeSong3(), refs: makeRefs3(), writePreset });
    h.q<HTMLButtonElement>('write-to-pedal-write-all')!.click();
    await h.setSlot('20');
    sendButton(h).click();
    await h.settle();
    await h.settle();

    expect(writePreset).toHaveBeenCalledTimes(2);
    expect(h.getSongPreset).toHaveBeenCalledTimes(2);
    expect(writePreset.mock.calls.map((c) => (c[0] as Preset).slot)).toEqual([20, 21]);
    expect(h.q('write-to-pedal-failure')?.textContent).toContain('Pedal ocupado.');
    expect(h.q('write-to-pedal-partial')?.textContent?.trim()).toBe('Ya escribimos: 20.');
    expect(h.q('write-to-pedal-success')).toBeNull();
    expect(sendButton(h).disabled).toBe(false);
  });

  test('R8 — bytes rejected by decodePrstFile show corruptFile and never reach writePreset', async () => {
    const bad = prstFor(0);
    bad[0x15] = 0x00; // break a sentinel byte
    const h = await mountStubbed({ getSongPreset: vi.fn().mockResolvedValue(bad) });
    sendButton(h).click();
    await h.settle();
    expect(h.q('write-to-pedal-failure')?.textContent).toContain('Archivo dañado.');
    expect(h.writePreset).not.toHaveBeenCalled();
  });

  test.each([
    [404, 'Canción no encontrada.'],
    [401, 'Sesión caducada.'],
    [0, 'Error de red.'],
    [500, 'Error.'],
  ])('R9-R12 — a fetch failing with HTTP %i shows the mapped failure and never calls writePreset', async (status, text) => {
    const h = await mountStubbed({
      getSongPreset: vi.fn().mockRejectedValue(new HttpErrorResponse({ status })),
    });
    sendButton(h).click();
    await h.settle();
    const failure = h.q('write-to-pedal-failure')!;
    expect(failure.textContent).toContain(text);
    expect(h.writePreset).not.toHaveBeenCalled();
    const login = failure.querySelector<HTMLAnchorElement>('a');
    if (status === 401) {
      expect(login?.getAttribute('href')).toBe('/login');
      expect(login?.textContent?.trim()).toBe('Iniciar sesión');
    } else {
      expect(login).toBeNull();
    }
  });

  test('R34 — connectionState dropping during the fetch aborts before writePreset with connectionLost', async () => {
    let conn!: ReturnType<typeof signal<ConnState>>;
    const getSongPreset = vi.fn(() => {
      conn.set('not-connected');
      return Promise.resolve(prstFor(0));
    });
    const h = await mountStubbed({ getSongPreset });
    conn = h.conn;
    sendButton(h).click();
    await h.settle();
    expect(getSongPreset).toHaveBeenCalledTimes(1);
    expect(h.writePreset).not.toHaveBeenCalled();
    expect(h.q('write-to-pedal-failure')?.textContent).toContain('Conexión perdida.');
  });

  test('R34 — connectionState flipping to error after item 1 of a multi write aborts the rest with connectionLost and partial progress', async () => {
    let conn!: ReturnType<typeof signal<ConnState>>;
    const writePreset = vi.fn(() => {
      conn.set('error');
      return Promise.resolve();
    });
    const h = await mountStubbed({ song: makeSong3(), refs: makeRefs3(), writePreset });
    conn = h.conn;
    h.q<HTMLButtonElement>('write-to-pedal-write-all')!.click();
    await h.setSlot('30');
    sendButton(h).click();
    await h.settle();
    expect(writePreset).toHaveBeenCalledTimes(1);
    expect(h.getSongPreset).toHaveBeenCalledTimes(1);
    expect(h.q('write-to-pedal-failure')?.textContent).toContain('Conexión perdida.');
    expect(h.q('write-to-pedal-partial')?.textContent?.trim()).toBe('Ya escribimos: 30.');
  });
});

describe('WriteToPedalDialog close rules (F5 R32)', () => {
  test('Escape and backdrop clicks are no-ops while a write is in flight', async () => {
    const pending = deferred();
    const h = await mountStubbed({ writePreset: vi.fn(() => pending.promise) });
    sendButton(h).click();
    await h.settle();
    expect(h.q('write-to-pedal-submitting')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    h.q('write-to-pedal-backdrop')!.click();
    await h.settle();
    expect(h.host.closedCount).toBe(0);
    expect(h.q('write-to-pedal-card')).toBeTruthy();
    expect(h.q<HTMLButtonElement>('write-to-pedal-cancel')!.disabled).toBe(true);
    expect(h.q<HTMLButtonElement>('write-to-pedal-dismiss')!.disabled).toBe(true);

    pending.resolve();
    await h.settle();
  });

  test('Escape closes the dialog when idle', async () => {
    const h = await mountStubbed({});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await h.settle();
    expect(h.host.closedCount).toBe(1);
  });

  test('a backdrop click closes the dialog when idle; a click inside the card does not', async () => {
    const h = await mountStubbed({});
    h.q('write-to-pedal-card')!.click();
    await h.settle();
    expect(h.host.closedCount).toBe(0);
    h.q('write-to-pedal-backdrop')!.click();
    await h.settle();
    expect(h.host.closedCount).toBe(1);
  });

  test('the header × has its own test id (write-to-pedal-dismiss) and closes when idle', async () => {
    const h = await mountStubbed({});
    expect(h.qa('write-to-pedal-close').length).toBe(0);
    h.q<HTMLButtonElement>('write-to-pedal-dismiss')!.click();
    await h.settle();
    expect(h.host.closedCount).toBe(1);
  });
});

describe('WriteToPedalDialog picker validation (F5 R16, R17, R21, R22)', () => {
  test('R19 / T23 phone check — the slot input asks mobile browsers for the numeric keypad', async () => {
    const h = await mountStubbed({});
    const input = h.q<HTMLInputElement>('write-to-pedal-slot-input')!;
    // type="number" opens the numeric keyboard even on mobile browsers that
    // ignore `inputmode`; inputmode + pattern give the digit-only pad on iOS.
    expect(input.getAttribute('type')).toBe('number');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.getAttribute('pattern')).toBe('[0-9]*');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('99');
    expect(input.getAttribute('step')).toBe('1');
    expect(input.value).toBe('0');
    // The app's own 0..99 validation still drives the inline error.
    await h.setSlot('150');
    expect(h.q('write-to-pedal-slot-error')?.textContent?.trim()).toBe('Fuera de rango.');
    await h.setSlot('42');
    expect(h.q('write-to-pedal-slot-error')).toBeNull();
    expect(sendButton(h).disabled).toBe(false);
  });

  test('R16 — a non-integer value disables Send without an inline error', async () => {
    const h = await mountStubbed({});
    await h.setSlot('abc');
    expect(sendButton(h).disabled).toBe(true);
    expect(h.q('write-to-pedal-slot-error')).toBeNull();
  });

  test('R17 — an integer outside 0..99 shows outOfRange inline, marks the input invalid and disables Send', async () => {
    const h = await mountStubbed({});
    await h.setSlot('150');
    expect(h.q('write-to-pedal-slot-error')?.textContent?.trim()).toBe('Fuera de rango.');
    const input = h.q<HTMLInputElement>('write-to-pedal-slot-input')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.classList.contains('border-red-500')).toBe(true);
    expect(input.classList.contains('dark:border-red-400')).toBe(true);
    expect(input.classList.contains('border-slate-300')).toBe(true); // static classes kept
    expect(sendButton(h).disabled).toBe(true);
  });

  test('R21 — write-all with too little room shows notEnoughRoom and disables Send', async () => {
    const h = await mountStubbed({ song: makeSong3(), refs: makeRefs3() });
    h.q<HTMLButtonElement>('write-to-pedal-write-all')!.click();
    await h.setSlot('98');
    expect(h.q('write-to-pedal-slot-error')?.textContent?.trim()).toBe('No caben 3 presets (quedan 2).');
    expect(h.q('write-to-pedal-range')).toBeNull();
    expect(sendButton(h).disabled).toBe(true);
  });

  test('R22 — write-all shows the resulting slot range summary; single mode hides it', async () => {
    const h = await mountStubbed({ song: makeSong3(), refs: makeRefs3() });
    await h.setSlot('5');
    expect(h.q('write-to-pedal-range')).toBeNull();
    h.q<HTMLButtonElement>('write-to-pedal-write-all')!.click();
    await h.settle();
    expect(h.q('write-to-pedal-range')?.textContent?.trim()).toBe('Slots 5..7 — 3 presets');
    expect(sendButton(h).disabled).toBe(false);
  });
});

describe('WriteToPedalDialog palette (F5 R51, R52 — T14)', () => {
  test('selected preset row carries bg-indigo-50 and the literal dark:bg-indigo-950/30 token; other rows do not', async () => {
    const h = await mountStubbed({});
    const rows = h.qa('write-to-pedal-preset-row');
    expect(rows[0]!.classList.contains('bg-indigo-50')).toBe(true);
    expect(rows[0]!.classList.contains('dark:bg-indigo-950/30')).toBe(true);
    expect(rows[0]!.className).not.toContain('\\');
    expect(rows[0]!.classList.contains('grid')).toBe(true); // static classes kept
    expect(rows[1]!.classList.contains('bg-indigo-50')).toBe(false);
    expect(rows[1]!.classList.contains('dark:bg-indigo-950/30')).toBe(false);

    rows[1]!.click();
    await h.settle();
    const after = h.qa('write-to-pedal-preset-row');
    expect(after[1]!.classList.contains('dark:bg-indigo-950/30')).toBe(true);
    expect(after[0]!.classList.contains('dark:bg-indigo-950/30')).toBe(false);
  });

  test('mode toggle inactive/active, summary, failure banner and success panel carry the design classes and dark: counterparts', async () => {
    const writePreset = vi.fn().mockRejectedValueOnce(new Error('request_in_progress')).mockResolvedValue(undefined);
    const h = await mountStubbed({ writePreset });
    const toggle = h.q<HTMLButtonElement>('write-to-pedal-write-all')!;
    for (const c of ['rounded-full', 'border-dashed', 'border-slate-300', 'text-slate-500', 'dark:border-slate-600', 'dark:text-slate-400']) {
      expect(toggle.classList.contains(c)).toBe(true);
    }
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    toggle.click();
    await h.settle();
    const active = h.q<HTMLButtonElement>('write-to-pedal-write-all')!;
    for (const c of ['border-indigo-300', 'bg-indigo-50', 'text-indigo-700', 'dark:border-indigo-400', 'dark:bg-indigo-950/40', 'dark:text-indigo-300']) {
      expect(active.classList.contains(c)).toBe(true);
    }
    expect(active.getAttribute('aria-pressed')).toBe('true');

    const summary = h.q('write-to-pedal-range')!;
    for (const c of ['bg-slate-50', 'text-slate-600', 'ring-slate-200', 'dark:bg-slate-900', 'dark:text-slate-300', 'dark:ring-slate-700']) {
      expect(summary.classList.contains(c)).toBe(true);
    }

    expect(sendButton(h).type).toBe('button');
    sendButton(h).click();
    await h.settle();
    const failure = h.q('write-to-pedal-failure')!;
    for (const c of ['bg-red-50', 'text-red-700', 'ring-red-200', 'dark:bg-red-950/40', 'dark:text-red-300', 'dark:ring-red-900']) {
      expect(failure.classList.contains(c)).toBe(true);
    }
    expect(failure.getAttribute('role')).toBe('alert');

    sendButton(h).click();
    await h.settle();
    const success = h.q('write-to-pedal-success')!;
    expect(success.className).toBe('flex flex-col items-center gap-3 px-4 py-8 text-center');
    const close = h.q('write-to-pedal-close')!;
    for (const c of ['bg-indigo-600', 'text-white', 'hover:bg-indigo-500', 'focus-visible:outline-indigo-600']) {
      expect(close.classList.contains(c)).toBe(true);
    }
  });
});
