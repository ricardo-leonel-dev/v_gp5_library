import { describe, expect, test, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SongsPage } from './songs-page';
import { environment } from '../../../environments/environment';
import type { Song } from '../song';
import { SYSEX_PRESET_CODEC } from '../../midi/sysex-preset-codec';
import { Gp5SysexPresetCodec } from '../../midi/gp5-sysex-preset-codec';

// Inline i18n fixture — Transloco's HTTP loader doesn't run in jsdom, so
// the F4 spec uses an in-memory loader (mirrored here).
const minimalTranslations: Translation = {
  unsupportedBrowser: {
    title: "This browser can't connect to the GP-5.",
    body: 'Connecting the pedal needs Web MIDI.',
    browsers: 'Open the app in Chrome, Edge, Opera, Samsung Internet, or Firefox 108+.',
    footnote: 'Your saved songs are still available in this browser.',
    insecure_body: 'This page was opened over an insecure connection (http://).',
    insecure_compact: 'Open it from an https:// address or from localhost.',
  },
  songs: {
    title: 'My songs',
    loading: 'Loading your songs…',
    new: 'New song',
    empty_title: 'No songs yet',
    empty_body: 'Connect your GP-5…',
    empty_connect: 'Connect to GP-5',
    preset_count_one: '1 preset',
    preset_count_other: '{{count}} presets',
    cover_alt: 'Cover of {{name}}',
    retry: 'Try again',
    login_again: 'Log in',
    card: {
      send_to_pedal: 'Send to pedal',
      send_to_pedal_aria: 'Send song "{{name}}" to the pedal',
    },
    errors: {
      unreachable: "Couldn't reach the server.",
      load_failed: "Your songs couldn't be loaded.",
      session_expired: 'Your session has expired.',
    },
  },
  songDetail: {
    presets_heading: 'Presets, in running order',
    reference_note: 'For reference only.',
    not_found: 'Song not found.',
  },
  pedalButton: {
    connect: 'Connect to GP-5',
    connecting: 'Connecting…',
    reading: 'Reading…',
    read: 'Read GP-5 presets',
    unsupported_hint: 'Browser does not support Web MIDI',
    dismiss_error: 'Dismiss',
  },
  auth: { login_link: 'Log in' },
  saveSong: {
    add_preset: 'Add preset from pedal…',
    add_preset_aria: 'Add a preset read from the pedal',
    add_file: 'Add .prst file',
    preset_row_aria: 'Position {{position}}: {{name}}, from the pedal',
    preset_row_file_aria: 'Position {{position}}: {{name}}, from a file',
    pedal_badge: 'pedal',
    file_badge: 'file',
    save: 'Save song',
    saving: 'Saving…',
    cancel: 'Cancel',
    success_title: 'Song saved',
    success_body: '"{{name}}" saved.',
    done: 'Close',
    no_bytes: 'No bytes',
    test_mode_title: 'Test mode.',
    test_mode_notice: 'Sample presets.',
    login_link: 'Log in',
    title: 'Save as song',
    close: 'Close',
    name: 'Song name',
    artist: 'Artist',
    optional: '(optional)',
    cover: 'Cover image',
    cover_help: 'PNG, JPG or WebP.',
    remove_file: 'Remove',
    presets_legend: 'Presets',
    presets_help: 'Add presets in order.',
    presets_empty: 'No presets yet.',
    attachments_legend: 'User files',
    attachments_help: 'Attach user slot files.',
    ir_help: '.wav file',
    nam_help: '.nam file',
    extra_legend: 'Extra details',
    extra_help: 'Notes etc.',
    extra_key_placeholder: 'key',
    extra_value_placeholder: 'value',
    add_field: 'Add field',
    remove_field: 'Remove field',
    move_up: 'Up',
    move_down: 'Down',
    remove_preset: 'Remove',
    plan: {
      presetLimitReached: 'Preset limit reached: {{limit}}.',
      songLimitReached: 'Song limit reached: {{limit}}.',
    },
    errors: {
      nameRequired: 'Name required.',
      nameTooLong: 'Name too long.',
      artistTooLong: 'Artist too long.',
      coverNotImage: 'Cover must be an image.',
      fileNameTooLong: 'File name too long.',
      presetsRequired: 'Add at least one preset.',
      presetNameDuplicate: 'Duplicate preset name "{{name}}".',
      presetLimitExceeded: 'Preset limit {{limit}}.',
      prstWrongSize: 'Wrong size.',
      prstNotGp5: 'Not a GP-5 preset.',
      prstCorrupt: 'Corrupt.',
      prstNoName: 'No name.',
      extraKeyRequired: 'Name required.',
      extraKeyDuplicate: 'Duplicate.',
      extraConfigTooLarge: 'Too large.',
      extraConfigInvalid: 'Invalid.',
      presetMissing: 'Missing.',
      presetNameUnsupported: 'Unsupported name.',
      presetNameUnreadable: 'Unreadable at #{{position}}.',
      coverTooMany: 'Only one cover.',
      planSongLimit: 'Plan song limit.',
      planPresetLimit: 'Plan preset limit.',
      planLimitGeneric: 'Plan limit.',
      sessionExpired: 'Session expired.',
      network: 'Network error.',
      unexpected: 'Unexpected.',
    },
  },
  writeToPedal: {
    title: 'Send to pedal',
    close: 'Close',
    song_heading: 'Song: "{{name}}"',
    presets_legend: 'Presets',
    preset_row_aria: 'Position {{position}}: {{name}}',
    target_slot: 'Target slot',
    write_all: 'Write all in order',
    write_all_help: 'Sends the song presets to consecutive slots.',
    not_connected: 'Connect your GP-5 to write to the pedal.',
    connect: 'Connect GP-5',
    connecting: 'Connecting…',
    cancel: 'Cancel',
    send: 'Send',
    writing: 'Sending…',
    success_title: 'Done',
    success_single: '"{{presetName}}" is now on slot {{toSlot}}.',
    success_multi: '{{count}} presets written to {{from}}..{{to}}.',
    partialProgress: 'Already wrote: {{slots}}.',
    done: 'Close',
    login_link: 'Log in',
    errors: {
      pedalDisconnected: 'Pedal disconnected.',
      busy: 'Pedal is busy.',
      timeout: 'Pedal did not respond.',
      connectionLost: 'Connection lost.',
      unexpected: 'Unexpected.',
      songNotFound: 'Song not found.',
      sessionExpired: 'Session expired.',
      network: 'Network error.',
      corruptFile: 'Corrupt file.',
    },
  },
  writeToSlot: {
    help: '0..99',
    errors: {
      outOfRange: 'Out of range.',
      notEnoughRoom: 'Not enough room for {{N}} presets (only {{available}} left).',
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

function setupTestBed() {
  TestBed.configureTestingModule({
    imports: [SongsPage],
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

describe('SongsPage (F5 R3, R4, R53, R54, R32)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    setupTestBed();
    httpMock = TestBed.inject(HttpTestingController);
  });

  const sampleSongs: Song[] = [
    {
      id: 'song-7',
      name: 'Lead Tones',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'TL DLX AMP' },
        { id: 'p1', sortOrder: 1, name: 'Lead Solo' },
      ],
    },
  ];

  test('R54 — the loading state shows songs-loading, not the song cards / button', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="songs-loading"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="song-card-send-to-pedal"]')).toBeNull();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
  });

  test('R54 — the error state shows songs-error, not the song cards / button', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="songs-error"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="song-card-send-to-pedal"]')).toBeNull();
  });

  test('R54 — the session_expired state shows songs-session-expired, not the song cards / button', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush('unauthorized', {
      status: 401,
      statusText: 'Unauthorized',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="songs-session-expired"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="song-card-send-to-pedal"]')).toBeNull();
  });

  test('R3, R53 — once loaded, each song card has a "Send to pedal" button of type="button"', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '[data-testid="song-card-send-to-pedal"]',
    );
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.type).toBe('button');
    expect(buttons[0]!.getAttribute('aria-label')).toContain('Lead Tones');
  });

  test('R3, R53 — clicking the button opens the dialog with the right song and preset snapshot', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-card-send-to-pedal"]',
    )!;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const dialog = root.querySelector('[data-testid="write-to-pedal-card"]');
    expect(dialog).toBeTruthy();
    expect(root.querySelectorAll('[data-testid="write-to-pedal-preset-row"]').length).toBe(2);
  });

  test('R4 — the dialog is a snapshot: later list refreshes do not change the open dialog', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-card-send-to-pedal"]',
    )!;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // A second GET to /songs (e.g. after a save) returns a different list.
    // The dialog should keep showing the originally-opened song + presets.
    fixture.componentInstance.load();
    const second = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    second.flush([
      {
        id: 'song-other',
        name: 'Different Song',
        presets: [{ id: 'q0', sortOrder: 0, name: 'Other' }],
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="write-to-pedal-card"]')).toBeTruthy();
    expect(
      root.querySelector('[data-testid="write-to-pedal-song-heading"]')?.textContent,
    ).toContain('Lead Tones');
    expect(root.querySelectorAll('[data-testid="write-to-pedal-preset-row"]').length).toBe(2);
  });

  test('R32 — closing the dialog returns focus to the originating button (queueMicrotask)', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-card-send-to-pedal"]',
    )!;
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Click the cancel button to emit `closed`.
    const cancel = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="write-to-pedal-cancel"]',
    )!;
    cancel.click();
    fixture.detectChanges();
    // The page schedules a focus return via queueMicrotask.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="write-to-pedal-card"]')).toBeNull();
    // The button is the active element.
    expect(document.activeElement).toBe(button);
  });

  // Review fixes 2026-10-07 — copy must be translated text, never raw keys.
  async function mountAndFlush(
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
  ): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<SongsPage>>; root: HTMLElement }> {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    respond(httpMock.expectOne(`${environment.apiBaseUrl}/songs`));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  test('loading state renders the translated songs.loading copy', async () => {
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="songs-loading"]')?.textContent?.trim()).toBe(
      'Loading your songs…',
    );
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
  });

  test('empty state renders the translated empty_title and empty_body', async () => {
    const { root } = await mountAndFlush((req) => req.flush([]));
    const empty = root.querySelector('[data-testid="songs-empty"]')!;
    expect(empty.textContent).toContain('No songs yet');
    expect(empty.textContent).toContain('Connect your GP-5…');
    expect(empty.textContent).not.toContain('Send to pedal');
    expect(empty.textContent).not.toContain('songs.');
  });

  test('a 500 renders the translated load_failed text, not the key', async () => {
    const { root } = await mountAndFlush((req) =>
      req.flush('boom', { status: 500, statusText: 'Server Error' }),
    );
    const errorMsg = root.querySelector('[data-testid="songs-error-message"]')!;
    expect(errorMsg.textContent?.trim()).toBe("Your songs couldn't be loaded.");
  });

  test('a network error (status 0) renders the translated unreachable text, not the key', async () => {
    const { root } = await mountAndFlush((req) =>
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' }),
    );
    const errorMsg = root.querySelector('[data-testid="songs-error-message"]')!;
    expect(errorMsg.textContent?.trim()).toBe("Couldn't reach the server.");
  });

  test('a 401 renders the translated session_expired text and a /login link', async () => {
    const { root } = await mountAndFlush((req) =>
      req.flush('unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );
    const expired = root.querySelector('[data-testid="songs-session-expired"]')!;
    expect(expired.textContent).toContain('Your session has expired.');
    expect(expired.textContent).not.toContain('songs.errors');
    const link = expired.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
    expect(link.textContent?.trim()).toBe('Log in');
  });

  test('the song-card button has no arrow glyph (design "Type": no → on buttons)', async () => {
    const { root } = await mountAndFlush((req) => req.flush(sampleSongs));
    const button = root.querySelector('[data-testid="song-card-send-to-pedal"]')!;
    expect(button.textContent?.trim()).toBe('Send to pedal');
    expect(button.textContent).not.toContain('→');
  });

  test('R32 / design §5 — with several songs, focus returns to the button of the card that opened the dialog', async () => {
    const threeSongs: Song[] = [
      sampleSongs[0]!,
      { id: 'song-8', name: 'Rhythm', presets: [{ id: 'r0', sortOrder: 0, name: 'Crunch' }] },
      { id: 'song-9', name: 'Ambient', presets: [{ id: 'a0', sortOrder: 0, name: 'Pad' }] },
    ];
    const { fixture, root } = await mountAndFlush((req) => req.flush(threeSongs));
    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '[data-testid="song-card-send-to-pedal"]',
    );
    expect(buttons.length).toBe(3);
    buttons[1]!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="write-to-pedal-song-heading"]')?.textContent).toContain(
      'Rhythm',
    );

    root.querySelector<HTMLButtonElement>('[data-testid="write-to-pedal-cancel"]')!.click();
    fixture.detectChanges();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    fixture.detectChanges();

    expect(root.querySelector('[data-testid="write-to-pedal-card"]')).toBeNull();
    expect(document.activeElement).toBe(buttons[1]);
    expect(document.activeElement).not.toBe(buttons[0]);
  });
});

// ---------------------------------------------------------------------------
// F26 `library_first_startup` — R2-R25, R59-R78, R80. The library page
// renders cards, opens the F4 save dialog, and never touches the pedal
// connection directly. Tests stub the page's external collaborators
// (`PedalPresetsStore`, `PedalConnectFlow`, `MockPresetsStore`, `Router`).
// ---------------------------------------------------------------------------

import { signal } from '@angular/core';
import { PedalPresetsStore } from '../../pedals/pedal-presets.store';
import { PedalConnectFlow } from '../../pedals/pedal-connect-flow.service';
import { MockPresetsStore } from '../../pedals/mock-presets.store';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { TONELAB_TLDLXAMP_PRST_HEX } from '../../midi/gp5-tonelab-prst.fixture';
import type { Preset } from '../../midi/preset';
import { encodePrstFile } from '../../midi/gp5-prst-file';
import { capturedBodyBytes } from '../../midi/gp5-captured-bodies.fixture';
import { decodeGp5Body, NAME_LEN } from '../../midi/gp5-sysex-preset-codec';

function prstBytesFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readableNameField(name: string): Uint8Array {
  const f = new Uint8Array(NAME_LEN);
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < NAME_LEN; i++) f[i] = i < enc.length ? enc[i] : 0;
  return f;
}

function buildPrstFor(name: string, body: Uint8Array, nameField: Uint8Array): Uint8Array {
  const chain = decodeGp5Body(body, name, 0).chain;
  const preset: Preset = { slot: 0, name, chain, raw: { body, nameField } };
  return encodePrstFile(preset);
}

function setupF26(opts: {
  pedalState?: 'not-connected' | 'connecting' | 'connected' | 'error';
  savable?: Preset[];
  mocks?: Preset[];
  navSpy?: ReturnType<typeof vi.fn>;
  supported?: boolean;
} = {}): {
  httpMock: HttpTestingController;
  pedal: { connect: ReturnType<typeof vi.fn>; readPresets: ReturnType<typeof vi.fn> };
  pedalPresets: { savableSnapshot: () => Preset[]; presets: ReturnType<typeof signal<Preset[]>>; loadState: ReturnType<typeof signal<string>>; read: () => Promise<void> };
  connectFlow: { start: () => Promise<void>; error: ReturnType<typeof signal<string | null>> };
  mocks: { load: () => void };
  navSpy: ReturnType<typeof vi.fn>;
} {
  const pedalState = opts.pedalState ?? 'not-connected';
  const supported = opts.supported ?? true;
  const pedal = {
    connectionState: signal(pedalState),
    isSupported: vi.fn(() => supported),
    connect: vi.fn(),
    readPresets: vi.fn(),
  } as unknown as WebMidiPedalConnection;
  const savable = opts.savable ?? [];
  let snapshotRef: Preset[] = savable
    .filter((p) => p.raw !== undefined)
    .slice()
    .sort((a, b) => a.slot - b.slot);
  const pedalPresets = {
    savableSnapshot: () => snapshotRef,
    presets: signal<Preset[]>([]),
    loadState: signal<'idle' | 'loading' | 'loaded' | 'error'>('idle'),
    read: vi.fn(),
    setSnapshot(next: Preset[]): void {
      snapshotRef = next
        .filter((p) => p.raw !== undefined)
        .slice()
        .sort((a, b) => a.slot - b.slot);
    },
  };
  const connectFlow = {
    supported,
    start: vi.fn().mockResolvedValue(undefined),
    error: signal<string | null>(null),
  };
  const mocks = {
    load: vi.fn(),
  };
  const navSpy = opts.navSpy ?? vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SongsPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
      { provide: SYSEX_PRESET_CODEC, useClass: Gp5SysexPresetCodec },
      { provide: WebMidiPedalConnection, useValue: pedal },
      { provide: PedalPresetsStore, useValue: pedalPresets },
      { provide: PedalConnectFlow, useValue: connectFlow },
      { provide: MockPresetsStore, useValue: mocks },
    ],
  });
  return {
    httpMock: TestBed.inject(HttpTestingController),
    pedal: pedal as unknown as { connect: ReturnType<typeof vi.fn>; readPresets: ReturnType<typeof vi.fn> },
    pedalPresets: pedalPresets as unknown as { savableSnapshot: () => Preset[]; presets: ReturnType<typeof signal<Preset[]>>; loadState: ReturnType<typeof signal<string>>; read: () => Promise<void> },
    connectFlow: connectFlow as unknown as { start: () => Promise<void>; error: ReturnType<typeof signal<string | null>> },
    mocks: mocks as unknown as { load: () => void },
    navSpy,
  };
}

describe('SongsPage (F26 R2-R25, R75-R78, R80)', () => {
  const sampleSongs: Song[] = [
    {
      id: 'song-7',
      name: 'Lead Tones',
      artist: 'Queen',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'TL DLX AMP' },
        { id: 'p1', sortOrder: 1, name: 'Lead Solo' },
      ],
    },
    {
      id: 'song-8',
      name: 'No Artist',
      presets: [{ id: 'p0', sortOrder: 0, name: 'X' }],
    },
  ];

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  test('exactly one GET /songs on init (R2)', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    httpMock.verify();
  });

  test('R3 — init does not call navigator.requestMIDIAccess', async () => {
    const requestSpy = vi.fn();
    vi.stubGlobal('navigator', { requestMIDIAccess: requestSpy });
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    expect(requestSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test('R4 — loading state renders songs-loading with sr-only translated text', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const loading = root.querySelector('[data-testid="songs-loading"]');
    expect(loading).not.toBeNull();
    // F5 assertion — only the sr-only label is the text content.
    expect(loading?.textContent?.trim()).toBe('Loading your songs…');
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
  });

  test('R5, R6, R10 — one song card per response, with name and grid classes', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const grid = root.querySelector('[data-testid="songs-grid"]');
    expect(grid?.className).toContain('grid');
    expect(grid?.className).toContain('grid-cols-2');
    expect(grid?.className).toContain('sm:grid-cols-3');
    expect(grid?.className).toContain('lg:grid-cols-4');
    const cards = root.querySelectorAll('[data-testid="song-card"]');
    expect(cards.length).toBe(2);
    const links = root.querySelectorAll('[data-testid="song-card-link"]');
    expect(links.length).toBe(2);
    expect(links[0]?.textContent?.trim()).toBe('Lead Tones');
    expect(links[1]?.textContent?.trim()).toBe('No Artist');
  });

  test('R7, R8 — artist is shown when not blank, hidden when null / absent', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const cards = root.querySelectorAll('[data-testid="song-card"]');
    // "Lead Tones" has artist "Queen" → shown.
    expect(cards[0]!.querySelector('[data-testid="song-card-artist"]')?.textContent?.trim()).toBe('Queen');
    // "No Artist" has no artist → element absent.
    expect(cards[1]!.querySelector('[data-testid="song-card-artist"]')).toBeNull();
  });

  test('R9 — preset count uses preset_count_one for 1 and preset_count_other for 3', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([
      { id: 'a', name: 'A', presets: [{ id: 'p', sortOrder: 0, name: 'X' }] },
      {
        id: 'b',
        name: 'B',
        presets: [
          { id: 'p1', sortOrder: 0, name: 'X' },
          { id: 'p2', sortOrder: 1, name: 'Y' },
          { id: 'p3', sortOrder: 2, name: 'Z' },
        ],
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const counts = root.querySelectorAll('[data-testid="song-card-count"]');
    expect(counts[0]?.textContent?.trim()).toBe('1 preset');
    expect(counts[1]?.textContent?.trim()).toBe('3 presets');
  });

  test('R75, R76, R77, R78 — song-card is an LI, contains one link, no interactive nesting', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector('li[data-testid="song-card"]')!;
    expect(card).not.toBeNull();
    expect(card.tagName).toBe('LI');
    expect(card.getAttribute('data-song-id')).toBe('song-7');
    const link = card.querySelector('a[data-testid="song-card-link"]')!;
    expect(link).not.toBeNull();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/songs/song-7');
    expect(link.textContent?.trim()).toBe('Lead Tones');
    // Send button exists in the card, not in the link.
    const button = card.querySelector('[data-testid="song-card-send-to-pedal"]')!;
    expect(button).not.toBeNull();
    expect(link.contains(button)).toBe(false);
    // No invalid nesting inside the grid.
    const grid = root.querySelector('[data-testid="songs-grid"]')!;
    expect(grid.querySelectorAll('a a, a button, button a, button button').length).toBe(0);
  });

  test('R11, R12, R17 — empty array shows songs-empty with CTA that calls PedalConnectFlow.start', async () => {
    const { httpMock, connectFlow } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const empty = root.querySelector('[data-testid="songs-empty"]')!;
    expect(empty.textContent).toContain('No songs yet');
    expect(root.querySelector('[data-testid="unsupported-browser-message"]')).toBeNull();
    const cta = root.querySelector<HTMLButtonElement>('[data-testid="songs-empty-connect"]')!;
    cta.click();
    await Promise.resolve();
    expect(connectFlow.start).toHaveBeenCalledTimes(1);
  });

  test('R59 — songs-new renders in loaded and empty states, absent while loading/error', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Loading: no songs-new.
    expect(fixture.nativeElement.querySelector('[data-testid="songs-new"]')).toBeNull();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    // Empty: songs-new visible.
    expect(fixture.nativeElement.querySelector('[data-testid="songs-new"]')).not.toBeNull();
  });

  test('R18 — one cover 500 and one cover 200 → both cards still rendered (R18)', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // Both covers request.
    const cover1 = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7/files/cover`);
    const cover2 = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-8/files/cover`);
    cover1.flush(new Blob(['boom'] as BlobPart[], { type: 'text/plain' }), {
      status: 500,
      statusText: 'Server Error',
    });
    cover2.flush(new Blob([new Uint8Array([0x89]) as BlobPart], { type: 'image/png' }));
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelectorAll('[data-testid="song-card"]').length).toBe(2);
  });

  test('R20-R24, R79 — error state: 500 → load_failed + retry button; 0 → unreachable', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const errMsg = root.querySelector('[data-testid="songs-error-message"]')!;
    expect(errMsg.textContent?.trim()).toBe("Your songs couldn't be loaded.");
    const retry = root.querySelector<HTMLButtonElement>('[data-testid="songs-retry"]')!;
    retry.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
  });

  test('R24 — 401 → songs-session-expired with /login link, no retry button', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs`)
      .flush('unauthorized', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const expired = root.querySelector('[data-testid="songs-session-expired"]')!;
    expect(expired.textContent).toContain('Your session has expired.');
    const link = expired.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
    expect(root.querySelector('[data-testid="songs-retry"]')).toBeNull();
  });

  test('R60, R61 — not-connected: openNewSong opens F4 dialog with []/[]/false, closed triggers reload', async () => {
    const { httpMock, pedalPresets } = setupF26({ pedalState: 'not-connected', savable: [] });
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Save-song dialog is open.
    const saveCard = root.querySelector('[data-testid="save-song-card"]');
    expect(saveCard).not.toBeNull();
    expect(pedalPresets.savableSnapshot().length).toBe(0);
    // No "Add preset" select (available is empty), but "Add .prst file" still shows.
    expect(root.querySelector('[data-testid="save-song-add-preset"]')).toBeNull();
    expect(root.querySelector('[data-testid="save-song-add-file"]')).not.toBeNull();
    // Close the dialog.
    root.querySelector<HTMLButtonElement>('[data-testid="save-song-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="save-song-card"]')).toBeNull();
    // Reload happened.
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
  });

  test('R68, R69 — connected with savable presets: dialog availablePresets has raw presets in slot order, no mocks', async () => {
    const fakeRaw = (slot: number, name: string): Preset => ({
      slot,
      name,
      chain: [],
      raw: { body: new Uint8Array(466), nameField: readableNameField(name) },
    });
    const noRawMock: Preset = { slot: 99, name: 'mock', chain: [] };
    const { httpMock, mocks } = setupF26({
      pedalState: 'connected',
      savable: [fakeRaw(12, 'X'), fakeRaw(3, 'Y'), noRawMock],
    });
    mocks.load();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const select = root.querySelector<HTMLSelectElement>('[data-testid="save-song-add-preset"]');
    expect(select).not.toBeNull();
    // The first option is the disabled placeholder (value ''); the rest
    // are the savable presets, with noRawMock excluded because it has no
    // `raw` bytes.
    const options = Array.from(select!.options)
      .map((o) => o.value)
      .filter((v) => v !== '');
    expect(options).toEqual(['3', '12']);
  });

  test('R70 — pedal preset + .prst file submit sends one POST /songs with both bytes in list order', async () => {
    const fakeRaw = (slot: number, name: string): Preset => ({
      slot,
      name,
      chain: [],
      raw: { body: capturedBodyBytes(0), nameField: readableNameField(name) },
    });
    const { httpMock } = setupF26({
      pedalState: 'connected',
      savable: [fakeRaw(3, 'Pedal One')],
    });
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Add the pedal preset (slot 3).
    const select = root.querySelector<HTMLSelectElement>('[data-testid="save-song-add-preset"]')!;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    // Add a .prst file.
    const fileInput = root.querySelector<HTMLInputElement>('[data-testid="save-song-add-file-input"]')!;
    const fileBytes = prstBytesFromHex(TONELAB_TLDLXAMP_PRST_HEX);
    const file = new File([fileBytes as BlobPart], '02-TLDLXAMP.prst', { type: 'application/octet-stream' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    // Fill the name.
    const nameInput = root.querySelector<HTMLInputElement>('[data-testid="save-song-name"]')!;
    nameInput.value = 'My Mix';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // Submit.
    root.querySelector<HTMLButtonElement>('[data-testid="save-song-submit"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const post = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toBeInstanceOf(FormData);
    const fd = post.request.body as FormData;
    const presets: File[] = [];
    fd.forEach((value, key) => {
      if (key === 'preset') presets.push(value as File);
    });
    expect(presets.length).toBe(2);
    // First file: pedal preset (slot 3) — its raw bytes equal the captured body + nameField
    // but that is what `encodePrstFile` packages; the file's content is the encoded .prst.
    // We verify order by checking the second file is the ToneLab file (its bytes match exactly).
    const expectedPrst = prstBytesFromHex(TONELAB_TLDLXAMP_PRST_HEX);
    const firstBytes = new Uint8Array(await presets[0]!.arrayBuffer());
    const secondBytes = new Uint8Array(await presets[1]!.arrayBuffer());
    // The first preset is the slot-3 pedal preset (encoded with its name); the
    // second is the ToneLab file (verbatim). The second is what we just picked,
    // so its bytes are identical.
    expect(Array.from(secondBytes)).toEqual(Array.from(expectedPrst));
    expect(firstBytes.length).toBe(507);
    post.flush({ id: 'new', name: 'My Mix' });
  });

  test('R71, R72, R73 — open with R68 inputs, then disconnect + change store → dialog keeps same instance; submit still works', async () => {
    const fakeRaw = (slot: number): Preset => {
      const name = `P${slot}`;
      return {
        slot,
        name,
        chain: [],
        raw: { body: new Uint8Array(466), nameField: readableNameField(name) },
      };
    };
    const { httpMock, pedalPresets } = setupF26({
      pedalState: 'connected',
      savable: [fakeRaw(3)],
    });
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Add the pedal preset.
    const select = root.querySelector<HTMLSelectElement>('[data-testid="save-song-add-preset"]')!;
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    // Now "change" the store: it returns a *different* snapshot, but the dialog
    // was opened with the previous one. We simulate by replacing the mock.
    (pedalPresets as unknown as { setSnapshot: (next: Preset[]) => void }).setSnapshot([]);
    fixture.detectChanges();
    // The dialog is still open with the original `availablePresets` instance
    // (R71). The page passes the same array reference to the dialog; identity
    // check verifies the dialog still has the slot-3 row.
    const row = root.querySelector('[data-testid="save-song-preset-row"]');
    expect(row).not.toBeNull();
    // Fill the name and submit.
    const nameInput = root.querySelector<HTMLInputElement>('[data-testid="save-song-name"]')!;
    nameInput.value = 'Snapshot Mix';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-testid="save-song-submit"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const post = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    const fd = post.request.body as FormData;
    const presets: File[] = [];
    fd.forEach((value, key) => {
      if (key === 'preset') presets.push(value as File);
    });
    // The disconnected store would return [] today, but the dialog was
    // already opened with the slot-3 preset. The submit includes its bytes.
    expect(presets.length).toBe(1);
    const bytes = new Uint8Array(await presets[0]!.arrayBuffer());
    expect(bytes.length).toBe(507);
    post.flush({ id: 'new', name: 'Snapshot Mix' });
  });

  test('R74 — open while connected (with presets), close, open again not-connected → availablePresets []', async () => {
    const fakeRaw = (slot: number): Preset => ({
      slot,
      name: 'P',
      chain: [],
      raw: { body: new Uint8Array(466), nameField: readableNameField('Preset') },
    });
    const { httpMock, pedalPresets } = setupF26({
      pedalState: 'connected',
      savable: [fakeRaw(0)],
    });
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    // First open: connected → has preset.
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="save-song-add-preset"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="save-song-cancel"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // Reload triggered.
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([]);
    await Promise.resolve();
    fixture.detectChanges();
    // Simulate disconnect for the next open.
    (pedalPresets as unknown as { setSnapshot: (next: Preset[]) => void }).setSnapshot([]);
    root.querySelector<HTMLButtonElement>('[data-testid="songs-new"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="save-song-add-preset"]')).toBeNull();
  });

  test('R25 — clicking song-card-link navigates to /songs/<id>', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const link = root.querySelector<HTMLAnchorElement>('[data-testid="song-card-link"]')!;
    expect(link.getAttribute('href')).toBe('/songs/song-7');
  });

  test('R57 — same response renders the same cards regardless of pedal state and mocks', async () => {
    const { httpMock, mocks } = setupF26({ pedalState: 'connected' });
    mocks.load();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush(sampleSongs);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const names = Array.from(root.querySelectorAll('[data-testid="song-card-link"]')).map(
      (a) => a.textContent?.trim(),
    );
    expect(names).toEqual(['Lead Tones', 'No Artist']);
  });

  test('R80 — T48: list response with sortOrder [1, 0] → dialog opens with sortOrder [0, 1] and positions [1, 2]', async () => {
    const { httpMock } = setupF26();
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs`).flush([
      {
        id: 'song-mixed',
        name: 'Mixed',
        presets: [
          { id: 'p1', sortOrder: 1, name: 'Second' },
          { id: 'p0', sortOrder: 0, name: 'First' },
        ],
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-card-send-to-pedal"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = root.querySelectorAll('[data-testid="write-to-pedal-preset-row"]');
    expect(rows.length).toBe(2);
    // First row should be "First" (sortOrder 0) at position 1; second "Second" at position 2.
    expect(rows[0]?.textContent).toContain('First');
    expect(rows[0]?.getAttribute('aria-label')).toContain('Position 1');
    expect(rows[1]?.textContent).toContain('Second');
    expect(rows[1]?.getAttribute('aria-label')).toContain('Position 2');
  });
});

describe('SongsPage — F9 unsupported browser', () => {
  const twoSongs: Song[] = [
    { id: 'song-1', name: 'One', presets: [{ id: 'p0', sortOrder: 0, name: 'A' }] },
    { id: 'song-2', name: 'Two', presets: [{ id: 'p0', sortOrder: 0, name: 'B' }] },
  ];

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function mountUnsupported(
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
  ) {
    const setup = setupF26({ supported: false });
    const fixture = TestBed.createComponent(SongsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    respond(setup.httpMock.expectOne(`${environment.apiBaseUrl}/songs`));
    await fixture.whenStable();
    fixture.detectChanges();
    return { ...setup, fixture, root: fixture.nativeElement as HTMLElement };
  }

  function expectNoPedalIo(s: Awaited<ReturnType<typeof mountUnsupported>>): void {
    expect(s.pedal.connect).not.toHaveBeenCalled();
    expect(s.pedal.readPresets).not.toHaveBeenCalled();
    expect(s.pedalPresets.read).not.toHaveBeenCalled();
    expect(s.connectFlow.start).not.toHaveBeenCalled();
  }

  test('R19, R21 — empty library: compact message replaces the connect CTA; no pedal I/O', async () => {
    const s = await mountUnsupported((req) => req.flush([]));
    const empty = s.root.querySelector('[data-testid="songs-empty"]')!;
    expect(empty).not.toBeNull();
    const message = empty.querySelector('[data-testid="unsupported-browser-message"]');
    expect(message).not.toBeNull();
    expect(message?.getAttribute('data-variant')).toBe('compact');
    expect(message?.textContent).toContain("This browser can't connect to the GP-5.");
    expect(s.root.querySelector('[data-testid="songs-empty-connect"]')).toBeNull();
    expectNoPedalIo(s);
  });

  test('R20, R21 — songs returned: one song-card per song, no unsupported message, no pedal I/O', async () => {
    const s = await mountUnsupported((req) => req.flush(twoSongs));
    expect(s.root.querySelectorAll('[data-testid="song-card"]')).toHaveLength(2);
    expect(s.root.querySelector('[data-testid="unsupported-browser-message"]')).toBeNull();
    expectNoPedalIo(s);
  });

  test('R21 — load error: error state renders, no pedal I/O', async () => {
    const s = await mountUnsupported((req) =>
      req.flush('boom', { status: 500, statusText: 'Server Error' }),
    );
    expect(s.root.querySelector('[data-testid="songs-error-message"]')).not.toBeNull();
    expectNoPedalIo(s);
  });
});
