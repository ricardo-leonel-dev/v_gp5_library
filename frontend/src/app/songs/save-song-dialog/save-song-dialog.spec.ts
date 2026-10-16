import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  provideTransloco,
  type Translation,
  type TranslocoLoader,
} from '@jsverse/transloco';
import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SaveSongDialog } from './save-song-dialog';
import { SongsApi } from '../songs-api.service';
import { PlanApi } from '../plan-api.service';
import { appConfig } from '../../app.config';
import type { Preset } from '../../midi/preset';
import type { CreatedSong } from '../song';
import { capturedBodyBytes } from '../../midi/gp5-captured-bodies.fixture';
import { tonelabPrstBytes } from '../../midi/gp5-tonelab-prst.fixture';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of(minimalTranslations);
  }
}

const minimalTranslations: Translation = {
  saveSong: {
    title: 'Save as song',
    close: 'Close',
    presets_legend: 'Presets in this song',
    presets_help: 'In the order you will use them.',
    presets_empty: 'No presets yet.',
    preset_row_aria: 'Position {{position}}: {{name}}, from the pedal',
    preset_row_file_aria: 'Position {{position}}: {{name}}, from a file',
    pedal_badge: 'pedal',
    file_badge: 'file',
    move_up: 'Move {{name}} up',
    move_down: 'Move {{name}} down',
    remove_preset: 'Remove {{name}}',
    add_preset: 'Add preset',
    add_preset_aria: 'Add preset from pedal',
    add_file: 'Add .prst file',
    name: 'Song name',
    artist: 'Artist',
    optional: '(optional)',
    cover: 'Cover image',
    cover_help: 'PNG, JPG or WebP.',
    remove_file: 'Remove',
    attachments_legend: 'User files',
    attachments_help: 'Attach the user slot files.',
    ir_help: '.wav',
    nam_help: '.nam',
    extra_legend: 'Extra details',
    extra_help: 'Anything else you want to remember.',
    extra_key_placeholder: 'e.g. tuning',
    extra_value_placeholder: 'e.g. Drop D',
    add_field: 'Add field',
    remove_field: 'Remove field',
    cancel: 'Cancel',
    save: 'Save song',
    saving: 'Saving…',
    success_title: 'Song saved',
    success_body: '"{{name}}" is now in your library.',
    done: 'Close',
    no_bytes: 'No bytes',
    test_mode_title: 'Test mode.',
    test_mode_notice: 'Sample presets.',
    login_link: 'Log in',
    plan: {
      presetLimitReached: 'Your plan allows up to {{limit}} presets per song.',
      songLimitReached: 'You reached your plan limit of {{limit}} songs.',
    },
    errors: {
      nameRequired: 'Enter a name.',
      nameTooLong: 'Names can be up to 255 characters.',
      artistTooLong: 'Artist can be up to 255 characters.',
      coverNotImage: 'Cover must be an image.',
      fileNameTooLong: 'File name too long.',
      presetsRequired: 'Add at least one preset.',
      presetNameDuplicate: 'Already has a preset named "{{name}}".',
      presetLimitExceeded: 'Your plan allows up to {{limit}}.',
      prstWrongSize: 'Wrong size.',
      prstNotGp5: 'Not a GP-5 preset.',
      prstCorrupt: 'Corrupt.',
      prstNoName: 'Empty name.',
      extraKeyRequired: 'Name the field.',
      extraKeyDuplicate: 'Duplicate.',
      extraConfigTooLarge: 'Too large.',
      extraConfigInvalid: 'Invalid JSON.',
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
  chainBoard: {
    userIrSlot: 'User IR {{slot}}',
    userSnapToneSlot: 'User SnapTone {{slot}}',
  },
};

function fixturePreset(slot: number, name: string, chain: Preset['chain'] = []): Preset {
  const body = capturedBodyBytes(0);
  const nameField = new Uint8Array(16);
  nameField.set([0x54, 0x4c, 0x20, 0x44, 0x4c, 0x58, 0x20, 0x41, 0x4d, 0x50], 0);
  return { slot, name, chain, raw: { body, nameField } };
}

const stubProviders = [
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([]),
  provideTransloco({
    config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
    loader: StubTranslocoLoader,
  }),
];

function setup(initial: Preset[], available: Preset[], testMode = false): {
  fixture: import('@angular/core/testing').ComponentFixture<SaveSongDialog>;
  httpMock: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SaveSongDialog],
    providers: stubProviders,
  });
  const fixture = TestBed.createComponent(SaveSongDialog);
  fixture.componentRef.setInput('initialPresets', initial);
  fixture.componentRef.setInput('availablePresets', available);
  fixture.componentRef.setInput('testMode', testMode);
  fixture.detectChanges();
  return { fixture, httpMock: TestBed.inject(HttpTestingController) };
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock
    .match((req) => typeof req.url === 'string' && req.url.startsWith('/i18n/'))
    .forEach((req) => req.flush({}));
}

function dispatchFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    value: [file],
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
}

function makePngFile(name = 'c.png'): File {
  // Minimal 1x1 PNG bytes
  const pngBytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  return new File([pngBytes], name, { type: 'image/png' });
}

beforeEach(() => {
  TestBed.resetTestingModule();
});

afterEach(() => {
  TestBed.resetTestingModule();
  vi.useRealTimers();
});

describe('SaveSongDialog (F4)', () => {
  test('card carries role=dialog, aria-modal, aria-labelledby pointing to title (R28)', async () => {
    const { fixture, httpMock } = setup([], []);
    flushI18n(httpMock);
    const card = fixture.nativeElement.querySelector('[data-testid="save-song-card"]');
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    const titleId = card.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    const titleEl = fixture.nativeElement.querySelector(`#${titleId}`);
    expect(titleEl).not.toBeNull();
    expect(titleEl.getAttribute('data-testid')).toBe('save-song-title');
  });

  test('Escape closes the dialog (no save) (R30)', () => {
    const { fixture } = setup([], []);
    const emitSpy = vi.spyOn(fixture.componentInstance.closed, 'emit');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(emitSpy).toHaveBeenCalled();
  });

  test('backdrop click closes; card click does not (R30)', () => {
    const { fixture } = setup([], []);
    const emitSpy = vi.spyOn(fixture.componentInstance.closed, 'emit');
    (fixture.nativeElement.querySelector('[data-testid="save-song-backdrop"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(emitSpy).toHaveBeenCalled();
    emitSpy.mockClear();
    (fixture.nativeElement.querySelector('[data-testid="save-song-card"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(emitSpy).not.toHaveBeenCalled();
  });

  test('pedal list — adds with two presets, move ↑/↓, removing leaves empty box (R33-R37)', async () => {
    const initial = [
      fixturePreset(1, 'A', [{ moduleType: 'cat7_fx1', enabled: true, parameters: {} }]),
      fixturePreset(2, 'B', [{ moduleType: 'cat7_fx3', enabled: true, parameters: {} }]),
    ];
    const available: Preset[] = [
      ...initial,
      fixturePreset(3, 'C'),
      fixturePreset(4, 'D', [{ moduleType: 'cat7_fx1', enabled: true, parameters: {} }]),
    ];
    const { fixture, httpMock } = setup(initial, available);
    flushI18n(httpMock);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('[data-testid="save-song-preset-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('1');
    expect(rows[0].querySelector('[data-testid="save-song-pedal-badge"]')).not.toBeNull();
    expect(rows[0].textContent).toContain('A');
    expect(rows[1].textContent).toContain('2');
    expect(rows[1].textContent).toContain('B');

    // First row's ↑ disabled, last row's ↓ disabled
    expect(
      (compiled.querySelector('[data-testid="save-song-preset-up-0"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="save-song-preset-down-1"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    // ↓ on row 0 → order [B, A]
    (compiled.querySelector('[data-testid="save-song-preset-down-0"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const namesAfterMove = Array.from(
      compiled.querySelectorAll('[data-testid="save-song-preset-row"]'),
    ).map((r) => r.querySelector('.truncate.font-medium')?.textContent ?? '');
    expect(namesAfterMove).toEqual(['B', 'A']);

    // Remove all → empty box
    (compiled.querySelector('[data-testid="save-song-preset-remove-0"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (compiled.querySelector('[data-testid="save-song-preset-remove-0"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-presets-empty"]')).not.toBeNull();
  });

  test('add from file — ToneLab appends a file row (R44)', async () => {
    const { fixture, httpMock } = setup([], []);
    flushI18n(httpMock);
    const compiled = fixture.nativeElement as HTMLElement;
    const fileInput = compiled.querySelector(
      '[data-testid="save-song-add-file-input"]',
    ) as HTMLInputElement;
    const file = new File([tonelabPrstBytes() as BlobPart], '02-TLDLXAMP.prst', { type: 'application/octet-stream' });
    dispatchFile(fileInput, file);
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(compiled.querySelectorAll('[data-testid="save-song-preset-row"]').length).toBe(1);
    const badge = compiled.querySelector('[data-testid="save-song-file-badge"]');
    expect(badge).not.toBeNull();
    const row = compiled.querySelector('[data-testid="save-song-preset-row"]');
    expect(row?.textContent ?? '').toContain('TL DLX AMP');
  });

  test('add from file — 506-byte file → prstWrongSize (R45)', async () => {
    const { fixture, httpMock } = setup([], []);
    flushI18n(httpMock);
    const compiled = fixture.nativeElement as HTMLElement;
    const fileInput = compiled.querySelector(
      '[data-testid="save-song-add-file-input"]',
    ) as HTMLInputElement;
    const bad = new File([new Uint8Array(506) as BlobPart], 'bad.prst', { type: 'application/octet-stream' });
    dispatchFile(fileInput, bad);
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-add-error"]')).not.toBeNull();
    expect(compiled.querySelectorAll('[data-testid="save-song-preset-row"]').length).toBe(0);
  });

  test('submit with empty list shows presetsRequired and no request (R51, R70)', async () => {
    const { fixture, httpMock } = setup([], []);
    flushI18n(httpMock);
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-presets-error"]')).not.toBeNull();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs`);
  });

  test('submit with blank name shows nameRequired (R60)', () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial);
    flushI18n(httpMock);
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-name-error"]')).not.toBeNull();
  });

  test('plan load — 500 response: no caps, no messages, no banner (R59)', async () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial);
    flushI18n(httpMock);
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush('boom', { status: 500, statusText: 'X' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(HttpTestingController).verify.bind(null)).toBeDefined();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="save-song-preset-limit"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="save-song-song-limit"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="save-song-error"]')).toBeNull();
  });

  test('plan response malformed body: no caps, no messages (R59)', async () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial);
    flushI18n(httpMock);
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush({ wrong: 'shape' });
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="save-song-preset-limit"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="save-song-song-limit"]')).toBeNull();
  });

  test('test mode — submit shows test-mode notice and never POST /songs (R92, R93)', async () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial, true);
    flushI18n(httpMock);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const name = compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement;
    name.value = 'Mock Song';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-test-mode"]')).not.toBeNull();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs`);
  });

  test('happy path — submits FormData with no pedal_preset_name and shows success (R77, R80, R85, R96)', async () => {
    const initial = [
      fixturePreset(5, 'Test Metal', [{ moduleType: 'catf_fx32', enabled: true, parameters: {} }]),
    ];
    const { fixture, httpMock } = setup(initial, initial, false);
    flushI18n(httpMock);
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush({
      plan: 'premium',
      limits: { songs: null, presetsPerSong: null },
      usage: { songs: 0 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).value = 'My Song';
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    expect(req.request.body).toBeInstanceOf(FormData);
    expect(req.request.body.has('pedal_preset_name')).toBe(false);
    expect(req.request.body.getAll('preset').length).toBe(1);
    req.flush({ id: 'song-1', name: 'My Song' } satisfies CreatedSong);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-success"]')).not.toBeNull();
  });

  test('plan_song_limit 402 → planSongLimit banner (R99, R97)', async () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial, false);
    flushI18n(httpMock);
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush({
      plan: 'free',
      limits: { songs: 1, presetsPerSong: 1 },
      usage: { songs: 1 },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).value = 'My Song';
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    req.flush({ code: 'plan_song_limit', limit: 1, error: 'x' }, { status: 402, statusText: 'X' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(compiled.querySelector('[data-testid="save-song-error"]')).not.toBeNull();
  });

  test('presetNameUnreadable 400 → banner with position (R108)', async () => {
    const initial = [fixturePreset(1, 'A')];
    const { fixture, httpMock } = setup(initial, initial, false);
    flushI18n(httpMock);
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/me/plan`).flush({
      plan: 'free',
      limits: { songs: 1, presetsPerSong: 1 },
      usage: { songs: 0 },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).value = 'My Song';
    (compiled.querySelector('[data-testid="save-song-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (compiled.querySelector('[data-testid="save-song-submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs`);
    req.flush(
      { error: 'preset file at position 1 has no readable GP-5 preset name' },
      { status: 400, statusText: 'X' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    const banner = compiled.querySelector('[data-testid="save-song-error"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent ?? '').toContain('2');
  });

  test('backdrop/card carry the literal class names (T43)', () => {
    const { fixture } = setup([], []);
    const compiled = fixture.nativeElement as HTMLElement;
    const backdrop = compiled.querySelector('[data-testid="save-song-backdrop"]') as HTMLElement;
    expect(backdrop.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'fixed',
        'inset-0',
        'z-50',
        'flex',
        'items-end',
        'justify-center',
        'bg-slate-900/40',
        'sm:items-center',
        'sm:p-4',
      ]),
    );
    const card = compiled.querySelector('[data-testid="save-song-card"]') as HTMLElement;
    expect(card.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'flex',
        'max-h-[100dvh]',
        'w-full',
        'max-w-lg',
        'flex-col',
        'overflow-hidden',
        'rounded-t-xl',
        'bg-white',
        'shadow-xl',
        'dark:bg-slate-800',
        'sm:max-h-[90vh]',
        'sm:rounded-xl',
      ]),
    );
  });
});