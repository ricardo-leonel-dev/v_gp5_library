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
  songs: {
    title: 'My songs',
    loading: 'Loading your songs…',
    empty_title: 'No songs yet',
    empty_body: 'Connect your GP-5…',
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
  auth: { login_link: 'Log in' },
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
    const error = root.querySelector('[data-testid="songs-error"]')!;
    expect(error.textContent?.trim()).toBe("Your songs couldn't be loaded.");
  });

  test('a network error (status 0) renders the translated unreachable text, not the key', async () => {
    const { root } = await mountAndFlush((req) =>
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' }),
    );
    const error = root.querySelector('[data-testid="songs-error"]')!;
    expect(error.textContent?.trim()).toBe("Couldn't reach the server.");
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
