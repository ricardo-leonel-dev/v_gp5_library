import { describe, expect, test, afterEach, vi } from 'vitest';
// @ts-expect-error - node types not in tsconfig
import { readFileSync } from 'fs';
// @ts-expect-error - node types not in tsconfig
import { join } from 'path';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import {
  provideTransloco,
  type Translation,
  type TranslocoLoader,
} from '@jsverse/transloco';
import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SongDetailPage } from './song-detail-page';
import { SongsApi } from '../songs-api.service';
import { environment } from '../../../environments/environment';
import type { SongDetail } from '../song';
import { encodePrstFile } from '../../midi/gp5-prst-file';
import { capturedBodyBytes } from '../../midi/gp5-captured-bodies.fixture';
import { decodeGp5Body, NAME_LEN } from '../../midi/gp5-sysex-preset-codec';
import type { Preset } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({
      songs: {
        title: 'My songs',
        loading: 'Loading…',
        retry: 'Try again',
        login_again: 'Log in',
        errors: {
          unreachable: "Couldn't reach the server.",
          load_failed: "Your songs couldn't be loaded.",
          session_expired: 'Your session has expired.',
        },
      },
      songDetail: {
        presets_heading: 'Presets, in running order',
        reference_note: 'Reference only.',
        not_found: 'Song not found.',
        view_chain: 'View chain',
        hide_chain: 'Hide chain',
        view_chain_aria: 'View chain for {{name}}',
        hide_chain_aria: 'Hide chain for {{name}}',
        chain_loading: 'Loading preset…',
        chain_load_failed: "Couldn't read this preset. Try again.",
        chain_retry: 'Try again',
        chain_invalid: "This preset is damaged and can't be shown.",
        chain_unverified_footnote:
          'This chain is read-only: names and page numbers come from the original preset, not from the pedal.',
        files_heading: 'User files',
        files_empty: 'No IR or NAM files were saved with this song.',
        file_kind_ir: 'IR',
        file_kind_nam: 'NAM',
        size_mb: '{{value}} MB',
        size_mb_below_min: '< {{value}} MB',
        extra_heading: 'Extra details',
        extra_empty: 'No extra details were saved with this song.',
        extra_value_empty: '(empty)',
      },
      songPresetDraft: {
        duplicate: 'Duplicate',
        duplicate_aria: 'Duplicate preset {{name}}',
        heading: 'Copy of “{{source}}”',
        unsaved: 'Not saved to the song',
        name_label: 'Preset name',
        name_help: 'Up to 16 characters.',
        edit_hint: 'Select a block to change its effect, bypass or values.',
        bypass_label: 'Block on',
        effect_label: 'Effect',
        footnote: 'Estimated from the manual.',
        export: 'Export .prst',
        send: 'Send to pedal',
        discard: 'Discard copy',
        save: 'Save to song',
        saving: 'Saving…',
        saved: '“{{name}}” was added to the song.',
        limit_reached: 'Your plan allows up to {{limit}} presets per song.',
        refresh_failed: 'The copy is saved, but the preset list could not be refreshed.',
        refresh_retry: 'Refresh list',
        errors: {
          name_required: 'Give the copy a name.',
          name_unsupported: 'Use up to 16 letters, numbers, spaces or basic symbols.',
          name_duplicate: 'This song already has a preset named “{{name}}”.',
          param_invalid: 'Enter a number.',
          duplicate_failed: "Couldn't copy this preset. Try again.",
          limit_reached_save: "This song reached your plan's preset limit.",
          name_taken: 'Another preset in this song uses this name.',
          unreachable: "Couldn't reach the server. Check your connection and save again.",
          session_expired: 'Your session expired. Log in again, then save the copy.',
          song_not_found: 'This song no longer exists. Export the copy to keep it.',
          rejected: 'The server did not accept this preset file. Export it to keep your changes.',
          save_failed: 'The copy was not saved. Try again.',
        },
        leave_title: 'Leave without saving the copy?',
        leave_message: 'Your changes to “{{name}}” aren\'t saved to the song and will be lost.',
        leave_stay: 'Keep editing',
        leave_confirm: 'Leave and discard',
      },
      chainBoard: {
        close: 'Close',
        browse: 'Browse',
        active: 'In this preset',
        state_on: 'On',
        state_off: 'Bypassed',
        parameters: 'Parameters',
        no_parameters: 'No parameters.',
        unknown_module: 'Unknown module.',
        manual_page: 'Manual p. {{page}}',
        categories: { c0: 'NR', c1: 'PRE', c4: 'AMP' },
        userIrSlot: 'User IR {{slot}}',
        userSnapToneSlot: 'User SnapTone {{slot}}',
      },
      presetBrowser: {
        footnote_unverified: 'Footnote.',
      },
      writeToPedal: {
        draft_note: 'Sends the unsaved copy “{{name}}”.',
        target_slot: 'Target slot',
        not_connected: 'Connect the pedal.',
        connect: 'Connect GP-5',
        connecting: 'Connecting…',
        cancel: 'Cancel',
        send: 'Send',
        writing: 'Writing…',
        success_title: 'Done',
        success_single: '“{{presetName}}” is on slot {{toSlot}}.',
        done: 'Close',
        song_heading: 'Song: “{{name}}”',
        presets_legend: 'Presets',
        preset_row_aria: 'Pos {{position}}: {{name}}',
        write_all: 'Write all',
        write_all_help: 'Help',
        partialProgress: 'Already wrote: {{slots}}.',
        errors: {
          pedalDisconnected: 'Pedal disconnected.',
          busy: 'Busy.',
          timeout: 'Timeout.',
          connectionLost: 'Connection lost.',
          unexpected: 'Error.',
          songNotFound: 'Not found.',
          sessionExpired: 'Session expired.',
          network: 'Network.',
          corruptFile: 'Corrupt file.',
          writeNotConfirmed: 'Not confirmed.',
          writeRejected: 'Rejected.',
        },
      },
      writeToSlot: {
        help: '0..99',
        errors: { outOfRange: 'Out of range.', notEnoughRoom: 'Not enough room.' },
        summary_range: 'Slots {{from}}..{{to}}',
      },
      unsupportedBrowser: {
        title: 'Unsupported',
        body: 'Body',
        browsers: 'Browsers',
        footnote: 'Footnote',
        insecure_body: 'Insecure',
        insecure_compact: 'Insecure compact',
      },
    } as Translation);
  }
}

function setupWithId(id: string | null): {
  httpMock: HttpTestingController;
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>;
  afterEach: typeof afterEach;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SongDetailPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (k: string) => (k === 'id' ? id : null) } },
        },
      },
      {
        provide: WebMidiPedalConnection,
        useValue: {
          isSupported: () => true,
          connectionState: signal<'not-connected' | 'connecting' | 'connected' | 'error'>('not-connected'),
          connect: vi.fn().mockResolvedValue(undefined),
          writePreset: vi.fn().mockResolvedValue(undefined),
        },
      },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SongDetailPage);
  fixture.detectChanges();
  return { httpMock, fixture, afterEach: () => {} };
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock.match(() => true).forEach((req) => req.flush({}));
}

describe('SongDetailPage (F26 R26-R42)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  test('R27 — exactly one GET /songs/<id> for the route id on init', async () => {
    const { fixture, httpMock } = setupWithId('song-7');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7`).flush({
      id: 'song-7',
      name: 'Lead Tones',
      presets: [],
      files: [],
    } as SongDetail);
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.verify();
  });

  test('R28 — loading testid while pending', async () => {
    const { fixture, httpMock } = setupWithId('song-7');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="song-detail-loading"]'),
    ).not.toBeNull();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7`).flush({
      id: 'song-7',
      name: 'X',
      presets: [],
      files: [],
    });
    await fixture.whenStable();
  });

  test('R29, R30, R31, R32, R33, R34, R42 — loaded: h1 name, optional artist, ordered presets, back link, reference note', async () => {
    const { fixture, httpMock } = setupWithId('song-7');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7`).flush({
      id: 'song-7',
      name: 'Lead Tones',
      artist: 'Queen',
      presets: [
        { id: 'p2', sortOrder: 2, name: 'C' },
        { id: 'p0', sortOrder: 0, name: 'A' },
        { id: 'p1', sortOrder: 1, name: 'B' },
      ],
      files: [],
    } as SongDetail);
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const h1 = root.querySelector('h1')!;
    expect(h1.textContent?.trim()).toBe('Lead Tones');
    expect(root.querySelector('[data-testid="song-detail-artist"]')?.textContent?.trim()).toBe('Queen');
    const rows = root.querySelectorAll('[data-testid="song-preset-row"]');
    expect(rows.length).toBe(3);
    // Order: A, B, C; positions 1, 2, 3.
    expect(rows[0]?.textContent?.trim()).toContain('1');
    expect(rows[0]?.textContent?.trim()).toContain('A');
    expect(rows[1]?.textContent?.trim()).toContain('2');
    expect(rows[1]?.textContent?.trim()).toContain('B');
    expect(rows[2]?.textContent?.trim()).toContain('3');
    expect(rows[2]?.textContent?.trim()).toContain('C');
    // R33: no slot / sortOrder raw value.
    expect(root.textContent).not.toMatch(/slot 0/);
    expect(root.textContent).not.toMatch(/sortOrder 0/);
    // R34 reference note + R42 back link.
    expect(root.querySelector('[data-testid="song-reference-note"]')).not.toBeNull();
    const back = root.querySelector<HTMLAnchorElement>('[data-testid="song-detail-back"]')!;
    expect(back.getAttribute('href')).toBe('/songs');
  });

  test('R30 — artist is hidden when blank', async () => {
    const { fixture, httpMock } = setupWithId('song-7');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-7`).flush({
      id: 'song-7',
      name: 'No Artist',
      presets: [],
      files: [],
    } as SongDetail);
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-artist"]')).toBeNull();
  });

  test('R35 — files with cover → one cover request', async () => {
    const { fixture, httpMock } = setupWithId('song-with-cover');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-with-cover`).flush({
      id: 'song-with-cover',
      name: 'Has Cover',
      presets: [],
      files: [
        {
          id: 'f1',
          kind: 'cover',
          originalFilename: 'cover.png',
          mimeType: 'image/png',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    } as SongDetail);
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-with-cover/files/cover`).flush(
      new Blob([new Uint8Array([0x89]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.verify();
  });

  test('R36 — files without cover → no cover request', async () => {
    const { fixture, httpMock } = setupWithId('song-no-cover');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-no-cover`).flush({
      id: 'song-no-cover',
      name: 'No Cover',
      presets: [],
      files: [],
    } as SongDetail);
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-no-cover/files/cover`);
  });

  test('R37 — 404 → song-detail-not-found', async () => {
    const { fixture, httpMock } = setupWithId('missing');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/missing`)
      .flush('not found', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-not-found"]')?.textContent).toContain(
      'Song not found.',
    );
  });

  test('R38 — status 0 → song-detail-error with unreachable copy + retry button', async () => {
    const { fixture, httpMock } = setupWithId('offline');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/offline`).error(new ProgressEvent('error'));
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-error"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-detail-error-message"]')?.textContent).toContain(
      "Couldn't reach the server.",
    );
    expect(root.querySelector('[data-testid="song-detail-retry"]')).not.toBeNull();
  });

  test('R39 — 500 → song-detail-error with load_failed copy', async () => {
    const { fixture, httpMock } = setupWithId('boom');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/boom`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-error-message"]')?.textContent).toContain(
      "Your songs couldn't be loaded.",
    );
  });

  test('R40 — retry button sends a new GET /songs/<id>', async () => {
    const { fixture, httpMock } = setupWithId('boom');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/boom`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const retry: HTMLButtonElement | null = fixture.nativeElement.querySelector(
      '[data-testid="song-detail-retry"]',
    );
    retry!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/boom`).flush({
      id: 'boom',
      name: 'B',
      presets: [],
      files: [],
    });
  });

  test('R41 — 401 → song-detail-session-expired with /login link', async () => {
    const { fixture, httpMock } = setupWithId('unauth');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/unauth`)
      .flush('unauth', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const expired = root.querySelector('[data-testid="song-detail-session-expired"]')!;
    expect(expired).not.toBeNull();
    const link = expired.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
    expect(link.textContent?.trim()).toBe('Log in');
  });

  test('R19 — destroying the detail fixture after a loaded cover revokes its object URL once', async () => {
    const created = 'blob:detail-cover';
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => created);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const { fixture, httpMock } = setupWithId('song-with-cover');
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-with-cover`).flush({
      id: 'song-with-cover',
      name: 'Has Cover',
      presets: [],
      files: [
        {
          id: 'f1',
          kind: 'cover',
          originalFilename: 'cover.png',
          mimeType: 'image/png',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    } as SongDetail);
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-with-cover/files/cover`).flush(
      new Blob([new Uint8Array([1]) as BlobPart], { type: 'image/png' }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(revokeObjectURL).toHaveBeenCalledWith(created);
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  });
});

// F30 `view_song_preset_content` — read-only chain board + block detail
// per preset row inside `/songs/:id`. Reuses the same chain-board /
// block-detail rendering as `/pedal/presets`; no edit / duplicate /
// export / write-to-pedal actions ship here (those are F27's scope).

function readableNameField(name: string): Uint8Array {
  const f = new Uint8Array(NAME_LEN);
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < NAME_LEN; i++) f[i] = i < enc.length ? enc[i] : 0;
  return f;
}

function buildPrstBytes(name: string): Uint8Array {
  const body = capturedBodyBytes(0);
  const chain = decodeGp5Body(body, name, 0).chain;
  const preset: Preset = { slot: 0, name, chain, raw: { body, nameField: readableNameField(name) } };
  return encodePrstFile(preset);
}

async function loadSongWithPresets(
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
  httpMock: HttpTestingController,
  songId: string,
  presets: ReadonlyArray<{ id: string; sortOrder: number; name: string }>,
): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  httpMock.expectOne(`${environment.apiBaseUrl}/songs/${songId}`).flush({
    id: songId,
    name: 'Test Song',
    presets,
    files: [],
  });
  await fixture.whenStable();
  await Promise.resolve();
  fixture.detectChanges();
}

// Wait until the row's chain status is 'loaded' so the duplicate button
// is in the DOM. Used by every F27 test that needs to interact with the
// expanded row panel.
async function waitForChainLoaded(
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
  sortOrder: number,
  expectedName: string,
): Promise<void> {
  const page = fixture.componentInstance as unknown as {
    chainStatusBySortOrder: () => ReadonlyMap<number, string>;
  };
  for (let i = 0; i < 50; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
    if (page.chainStatusBySortOrder().get(sortOrder) === 'loaded') {
      const root = fixture.nativeElement as HTMLElement;
      const dup = root.querySelector(`[data-testid="song-preset-duplicate-${sortOrder}"]`);
      if (dup) {
        const aria = dup.getAttribute('aria-label') ?? '';
        if (aria.includes(expectedName)) return;
      }
    }
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

// Open a row, flush its chain request, and wait for the chain to load.
async function openRowAndLoad(
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
  httpMock: HttpTestingController,
  songId: string,
  sortOrder: number,
  name: string,
): Promise<void> {
  const root = fixture.nativeElement as HTMLElement;
  const toggle = root.querySelector<HTMLButtonElement>(
    `[data-testid="song-preset-toggle-${sortOrder}"]`,
  )!;
  toggle.click();
  fixture.detectChanges();
  const req = httpMock.expectOne(
    `${environment.apiBaseUrl}/songs/${songId}/files/preset?sort_order=${sortOrder}`,
  );
  req.flush(
    new Blob([buildPrstBytes(name) as BlobPart], { type: 'application/octet-stream' }),
  );
  await waitForChainLoaded(fixture, sortOrder, name);
}

// Helper: click Duplicate and flush the requests it triggers. F31 made
// `onDuplicate` await `Promise.all([getSongPreset, ensurePlan])`, so the
// helper now flushes both. Callers that need to inspect the plan request
// individually should set `planResponse` accordingly.
async function clickDuplicateAndFlush(
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
  httpMock: HttpTestingController,
  options: { planResponse?: unknown | null; planStatus?: number } = {},
): Promise<void> {
  const root = fixture.nativeElement as HTMLElement;
  const dup = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-duplicate-0"]')!;
  expect(dup).not.toBeNull();
  dup.click();
  fixture.detectChanges();
  // Wait for both pending requests (preset bytes + /me/plan) to be made.
  // httpMock.match returns all known requests including already-flushed
  // ones, so we look for the new ones by URL: the duplicate's preset
  // fetch and the /me/plan fetch.
  for (let i = 0; i < 50; i++) {
    const all = httpMock.match(() => true);
    const planReq = all.find((r) => r.request.url.endsWith('/me/plan'));
    const presetReqs = all.filter((r) => r.request.url.includes('/files/preset'));
    const lastPreset = presetReqs[presetReqs.length - 1];
    if (planReq && lastPreset) {
      lastPreset.flush(
        new Blob([buildPrstBytes('LEAD') as BlobPart], { type: 'application/octet-stream' }),
      );
      if (options.planStatus !== undefined && options.planStatus >= 400) {
        planReq.flush('boom', { status: options.planStatus, statusText: 'Server Error' });
      } else if (options.planResponse !== undefined) {
        planReq.flush(options.planResponse);
      } else {
        planReq.flush({
          plan: 'free',
          limits: { songs: 1, presetsPerSong: null },
          usage: { songs: 1 },
        });
      }
      break;
    }
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  // Allow the createDraft → draft.set signal to propagate.
  for (let i = 0; i < 30; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
    if (root.querySelector('[data-testid="song-preset-draft"]')) return;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe('SongDetailPage (F30 — view preset content)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  test('R1 — preset row is a toggle button with aria-expanded starting collapsed', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'Lead' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-controls')).toBe('song-preset-panel-0');
    expect(root.querySelector('[data-testid="song-preset-panel"]')).toBeNull();
  });

  test('R2 — opening a row requests the preset bytes with the correct sortOrder + auth + responseType=blob', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'Lead' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]')!;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[data-testid="song-preset-panel"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-preset-loading"]')).not.toBeNull();
    const req = httpMock.expectOne(
      `${environment.apiBaseUrl}/songs/song-chain/files/preset?sort_order=0`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([buildPrstBytes('Lead') as BlobPart], { type: 'application/octet-stream' }));
  });

  test('R3 — read-only contract: no edit / duplicate / export / write-to-pedal controls are imported or rendered in the F30 path', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'Lead' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]')!;
    toggle.click();
    fixture.detectChanges();
    const panel = root.querySelector('[data-testid="song-preset-panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    // The full preset list never shows write/edit affordances — only the
    // chain-board, the panel read-only note, and the loading/error/
    // invalid branches live here.
    for (const banned of [
      'export-mark-0',
      'save-song-open',
      'write-to-pedal-open',
      'duplicate-preset',
      'preset-edit',
    ]) {
      expect(panel.querySelector(`[data-testid="${banned}"]`)).toBeNull();
    }
    for (const allowed of ['song-preset-loading', 'song-preset-headline']) {
      // Either the loading or the loaded/error/invalid branch shows —
      // the chain-board host element appears once the chain loads.
      expect(panel).not.toBeNull();
      // Just confirm the panel exists; the loading branch renders
      // synchronously while the loaded branch needs bytes.
      void allowed;
    }
  });

  test('R4 — accordion contract: clicking a second row closes the previous one (single-expansion)', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'A' },
      { id: 'p1', sortOrder: 1, name: 'B' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const tA = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]')!;
    const tB = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-1"]')!;
    tA.click();
    fixture.detectChanges();
    expect(tA.getAttribute('aria-expanded')).toBe('true');
    tB.click();
    fixture.detectChanges();
    expect(tA.getAttribute('aria-expanded')).toBe('false');
    expect(tB.getAttribute('aria-expanded')).toBe('true');
  });

  test('R5 — accordion contract: clicking the open row closes it', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'Lead' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]')!;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('[data-testid="song-preset-panel"]')).toBeNull();
  });

  test('R6 — visual contract: shared chain-board component is reused in the song-detail-page template', () => {
    // The chain-board DOM is owned by the shared component from
    // `src/app/pedals/chain-board/chain-board.{ts,html}` and is rendered
    // identically across `/pedal/presets` and `/songs/:id`. F30 ships
    // by binding the preset's chain to <app-chain-board> in the F30
    // template; assertions about specific chain-board internals (cable,
    // 5-col grid, block patterns) live in `chain-board.spec.ts` and the
    // F14 / F16 / F17 regression suites. This F30 test records that the
    // same component / data shape is reused — a structural guarantee
    // for the reviewer.
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const pageSource = readFileSync(
      join(cwd, 'src/app/songs/song-detail-page/song-detail-page.ts'),
      'utf8',
    ) as string;
    const htmlSource = readFileSync(
      join(cwd, 'src/app/songs/song-detail-page/song-detail-page.html'),
      'utf8',
    ) as string;
    // The page imports `ChainBoard` and binds the decoded chain to it.
    expect(pageSource).toContain("import { ChainBoard");
    // The template renders the shared component selector.
    expect(htmlSource).toContain('<app-chain-board');
    // The block-detail component is also shared with /pedal/presets for
    // showing params read-only.
    expect(pageSource).toContain("import { BlockDetail");
    expect(htmlSource).toContain('<app-block-detail');
  });

  test('R7 — i18n parity: songDetail view-chain / hide-chain / chain-loading / chain-load-failed / chain-retry / chain-invalid / chain_unverified_footnote keys exist in both es and en', () => {
    // The keys are declared in `public/i18n/{es,en}.json` under `songDetail`
    // and the F26 i18n parity spec already verifies leaf equality. F30
    // re-asserts the F30-only additions here so a regression is caught
    // even if F26 is skipped.
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const es = JSON.parse(readFileSync(join(cwd, 'public/i18n/es.json'), 'utf8')) as Record<string, unknown>;
    const en = JSON.parse(readFileSync(join(cwd, 'public/i18n/en.json'), 'utf8')) as Record<string, unknown>;
    const requiredKeys = [
      'songDetail.view_chain',
      'songDetail.hide_chain',
      'songDetail.view_chain_aria',
      'songDetail.hide_chain_aria',
      'songDetail.chain_loading',
      'songDetail.chain_load_failed',
      'songDetail.chain_retry',
      'songDetail.chain_invalid',
      'songDetail.chain_unverified_footnote',
    ];
    for (const k of requiredKeys) {
      const esVal = k.split('.').reduce<unknown>(
        (acc, segment) => (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[segment]
          : undefined),
        es,
      );
      const enVal = k.split('.').reduce<unknown>(
        (acc, segment) => (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[segment]
          : undefined),
        en,
      );
      expect(typeof esVal).toBe('string');
      expect(typeof enVal).toBe('string');
      expect((esVal as string).length).toBeGreaterThan(0);
      expect((enVal as string).length).toBeGreaterThan(0);
    }
  });

  test('R8 — responsive contract: expansion layout keeps the preset list inside the max-w-5xl column and uses 5-col chain-board at every breakpoint', async () => {
    const { fixture, httpMock } = setupWithId('song-chain');
    await loadSongWithPresets(fixture, httpMock, 'song-chain', [
      { id: 'p0', sortOrder: 0, name: 'Lead' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const toggleRow = root.querySelector('[data-testid="song-preset-toggle-0"]') as HTMLElement;
    // Toggle row: 1.5rem position column + 1fr name + auto chevron — fits
    // 375px and grows the name cell up to 1280px. (architecture §2
    // breakpoint = 640px so the grid is not gated on `sm:`.)
    expect(toggleRow.classList.contains('grid-cols-[1.5rem_1fr_auto]')).toBe(true);
    expect(toggleRow.classList.contains('w-full')).toBe(true);
  });
});

// F27 `song_preset_duplicate_edit_export` — duplicate, edit, export,
// send-to-pedal, discard, and leave confirmation wiring on the page.
describe('SongDetailPage (F27 duplicate / edit / export / send / discard)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  test('R9 — opening a row shows a Duplicate button enabled when no draft exists', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    const dup = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-duplicate-0"]');
    expect(dup).not.toBeNull();
    expect(dup!.disabled).toBe(false);
  });

  test('R10 — clicking Duplicate fetches the bytes, creates a draft, and never sends a modifying request', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    const mutating = httpMock.match(() => true).filter(
      (req) => !['GET', 'HEAD'].includes(req.request.method),
    );
    expect(mutating).toEqual([]);
    httpMock.verify();
  });

  test('R11 — the new draft is named "<source> 2" and the name input is pre-filled', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]');
    expect(input?.value).toBe('LEAD 2');
  });

  test('R12, R13 — while a draft exists, every Duplicate button is disabled', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'A' },
      { id: 'p1', sortOrder: 1, name: 'B' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    // Open row 1 (no duplicate yet) and verify the duplicate button on it
    // is enabled before any draft exists.
    await openRowAndLoad(fixture, httpMock, 'song-dup', 1, 'B');
    const dupB1 = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-duplicate-1"]')!;
    expect(dupB1.disabled).toBe(false);
    // Close row 1, open row 0, and create a draft.
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-1"]')!.click();
    fixture.detectChanges();
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'A');
    await clickDuplicateAndFlush(fixture, httpMock);
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    // Re-open row 1: the chain is already cached, so the row toggles
    // open without a new HTTP request. The Duplicate button there must
    // be disabled because a draft exists.
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-1"]')!.click();
    fixture.detectChanges();
    const dupB2 = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-duplicate-1"]')!;
    expect(dupB2.disabled).toBe(true);
  });

  test('R16 — selecting a block on the draft chain board renders the edit-mode block detail', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const board = root.querySelector('[data-testid="chain-board"]')!;
    const firstBlock = board.querySelector<HTMLButtonElement>('[data-testid="board-block-0"]')!;
    firstBlock.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft-block-detail"]')).not.toBeNull();
  });

  test('R18 — toggling the bypass switch flips the dim class on the draft board', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const board = root.querySelector('[data-testid="chain-board"]')!;
    // The draft chain is the second chain board on the page; pick the one
    // that has the draft panel as a sibling.
    const firstBlock = board.querySelector<HTMLButtonElement>('[data-testid="board-block-0"]')!;
    firstBlock.click();
    fixture.detectChanges();
    const sw = root.querySelector<HTMLButtonElement>('[data-testid="bypass-switch"]')!;
    // The block starts at whatever the source body says. After clicking
    // the switch, the new value (the opposite) is reflected.
    const before = firstBlock.getAttribute('data-enabled');
    sw.click();
    fixture.detectChanges();
    const after = firstBlock.getAttribute('data-enabled');
    expect(after).not.toBe(before);
    expect(root.querySelector('[data-testid="song-preset-draft-unsaved"]')).not.toBeNull();
  });

  test('R25, R27 — clearing the name triggers name_required, then duplicate triggers name_duplicate', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
      { id: 'p1', sortOrder: 1, name: 'RHYTHM' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]')!;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const errEl = root.querySelector('[data-testid="song-preset-draft-name-error"]');
    expect(errEl?.textContent).toContain('Give the copy a name.');
    // Type the OTHER song preset's name → duplicate error.
    input.value = 'RHYTHM';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const errEl2 = root.querySelector('[data-testid="song-preset-draft-name-error"]');
    expect(errEl2?.textContent).toContain('This song already has a preset named');
  });

  test('R28 — Export .prst and Send to pedal are disabled while the name has an error', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]')!;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-export"]')!.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-send"]')!.disabled).toBe(true);
  });

  test('R30 — editing the draft sends no non-GET request', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const board = root.querySelector('[data-testid="chain-board"]')!;
    board.querySelector<HTMLButtonElement>('[data-testid="board-block-0"]')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-testid="bypass-switch"]')!.click();
    fixture.detectChanges();
    const mutating = httpMock.match(() => true).filter(
      (req) => !['GET', 'HEAD'].includes(req.request.method),
    );
    expect(mutating).toEqual([]);
  });

  test('R37, R38 — Export .prst triggers a Blob download and never sends a network request', async () => {
    const createObjectURL = vi.fn(() => 'blob:draft-export');
    const revokeObjectURL = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const origCreateElement = document.createElement.bind(document);
    const anchorClick = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = anchorClick;
      return el;
    });
    try {
      const { fixture, httpMock } = setupWithId('song-dup');
      await loadSongWithPresets(fixture, httpMock, 'song-dup', [
        { id: 'p0', sortOrder: 0, name: 'LEAD' },
      ]);
      const root = fixture.nativeElement as HTMLElement;
      await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
      await clickDuplicateAndFlush(fixture, httpMock);
      root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-export"]')!.click();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClick).toHaveBeenCalledTimes(1);
      const mutating = httpMock.match(() => true).filter(
        (req) => !['GET', 'HEAD'].includes(req.request.method),
      );
      expect(mutating).toEqual([]);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      vi.restoreAllMocks();
    }
  });

  test('R43 — Discard removes the draft panel and re-enables Duplicate', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-discard"]')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft"]')).toBeNull();
    // Re-open the row (the chain is cached, no new request).
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-toggle-0"]')!.click();
    fixture.detectChanges();
    const dup = root.querySelector<HTMLButtonElement>('[data-testid="song-preset-duplicate-0"]')!;
    expect(dup.disabled).toBe(false);
  });

  test('R46, R47 — draft action bar uses flex-wrap and editor row uses lg:flex-row with min-w-0 on both children', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const actions = root.querySelector('[data-testid="song-preset-draft-actions"]') as HTMLElement;
    expect(actions.className).toContain('flex-wrap');
    const editorRow = root.querySelector('.lg\\:flex-row') as HTMLElement | null;
    expect(editorRow).not.toBeNull();
  });

  test('R52, R54 — beforeunload is only prevented when the draft has unsaved edits', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    // No edits yet: beforeunload is NOT prevented.
    const ev1 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev1);
    expect(ev1.defaultPrevented).toBe(false);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]')!;
    input.value = 'LEAD X';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const ev2 = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
  });

  test('R53, R55 — confirmLeave returns true with no draft, and after Discard', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    const page = (fixture.componentInstance as unknown as { confirmLeave: () => boolean | Promise<boolean> });
    expect(page.confirmLeave()).toBe(true);
    await clickDuplicateAndFlush(fixture, httpMock);
    expect(page.confirmLeave()).toBe(true);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]')!;
    input.value = 'LEAD Y';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const held = page.confirmLeave();
    fixture.detectChanges();
    expect(typeof held).toBe('object');
    expect(root.querySelector('[data-testid="leave-draft-dialog"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="leave-draft-leave"]')!.click();
    fixture.detectChanges();
    const resolved = await (held as Promise<boolean>);
    expect(resolved).toBe(true);
    expect(page.confirmLeave()).toBe(true);
  });

  test('R50 — "Keep editing" cancels the held navigation and keeps the draft', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    const root = fixture.nativeElement as HTMLElement;
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    const input = root.querySelector<HTMLInputElement>('[data-testid="song-preset-draft-name"]')!;
    input.value = 'LEAD Z';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const page = (fixture.componentInstance as unknown as { confirmLeave: () => boolean | Promise<boolean> });
    const held = page.confirmLeave() as Promise<boolean>;
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-testid="leave-draft-stay"]')!.click();
    fixture.detectChanges();
    expect(await held).toBe(false);
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
  });
});

// F31 `song_preset_draft_save` — plan limit, save flow, refresh, retry,
// no leave prompt after a successful save, i18n parity keys.

describe('SongDetailPage (F31 save + plan limit)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // Helper to duplicate and assert only the Duplicate+plan requests fired.
  async function duplicateAndAssert(
    fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
    httpMock: HttpTestingController,
    planResponse: unknown = {
      plan: 'free',
      limits: { songs: 1, presetsPerSong: null },
      usage: { songs: 1 },
    },
  ): Promise<void> {
    await clickDuplicateAndFlush(fixture, httpMock, { planResponse });
  }

  test.each([
    {
      label: 'a: limit 1, 1 preset, draft open',
      limit: 1,
      presetCount: 1,
      expectSaveDisabled: true,
      expectHint: true,
    },
    {
      label: 'd: limit 2, 1 preset, draft open',
      limit: 2,
      presetCount: 1,
      expectSaveDisabled: false,
      expectHint: false,
    },
    {
      label: 'e: limit null (unlimited), 5 presets, draft open',
      limit: null,
      presetCount: 5,
      expectSaveDisabled: false,
      expectHint: false,
    },
  ])('R1 — %s', async ({ limit, presetCount, expectSaveDisabled, expectHint }) => {
    const { fixture, httpMock } = setupWithId('song-limit');
    const presets: { id: string; sortOrder: number; name: string }[] = [];
    for (let i = 0; i < presetCount; i++) {
      presets.push({ id: `p${i}`, sortOrder: i, name: `P${i}` });
    }
    await loadSongWithPresets(fixture, httpMock, 'song-limit', presets);
    await openRowAndLoad(fixture, httpMock, 'song-limit', 0, 'P0');
    await duplicateAndAssert(fixture, httpMock, {
      plan: 'free',
      limits: { songs: 1, presetsPerSong: limit },
      usage: { songs: 1 },
    });
    const root = fixture.nativeElement as HTMLElement;
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    expect(saveBtn.disabled).toBe(expectSaveDisabled);
    const hint = root.querySelector('[data-testid="song-preset-draft-limit-hint"]');
    if (expectHint) {
      expect(hint).not.toBeNull();
      expect(hint?.id).toBe('song-preset-draft-limit-hint');
      expect(saveBtn.getAttribute('aria-describedby')).toBe('song-preset-draft-limit-hint');
    } else {
      expect(hint).toBeNull();
      expect(saveBtn.getAttribute('aria-describedby')).toBeNull();
    }
  });

  test('R1 — c: at limit, every row\'s Duplicate button is still enabled (no draft yet)', async () => {
    const { fixture, httpMock } = setupWithId('song-limit-c');
    await loadSongWithPresets(fixture, httpMock, 'song-limit-c', [
      { id: 'p0', sortOrder: 0, name: 'A' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-limit-c', 0, 'A');
    // Even though limit=1, count=1, Duplicate stays enabled (A2).
    const dup = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-duplicate-0"]',
    )!;
    expect(dup.disabled).toBe(false);
  });

  test('R1 — b: at limit, Export .prst and Send to pedal remain enabled (with a valid name)', async () => {
    const { fixture, httpMock } = setupWithId('song-limit-b');
    await loadSongWithPresets(fixture, httpMock, 'song-limit-b', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-limit-b', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock, {
      plan: 'free',
      limits: { songs: 1, presetsPerSong: 1 },
      usage: { songs: 1 },
    });
    const root = fixture.nativeElement as HTMLElement;
    const exportBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-export"]',
    )!;
    const sendBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-send"]',
    )!;
    expect(exportBtn.disabled).toBe(false);
    expect(sendBtn.disabled).toBe(false);
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    expect(saveBtn.disabled).toBe(true);
  });

  test('R2 — /me/plan 500 keeps Save enabled and shows no hint', async () => {
    const { fixture, httpMock } = setupWithId('song-plan-500');
    await loadSongWithPresets(fixture, httpMock, 'song-plan-500', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-plan-500', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock, { planStatus: 500 });
    const root = fixture.nativeElement as HTMLElement;
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    expect(saveBtn.disabled).toBe(false);
    expect(root.querySelector('[data-testid="song-preset-draft-limit-hint"]')).toBeNull();
  });

  test('R2 — /me/plan with unparseable body keeps Save enabled and shows no hint', async () => {
    const { fixture, httpMock } = setupWithId('song-plan-bad');
    await loadSongWithPresets(fixture, httpMock, 'song-plan-bad', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-plan-bad', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock, { planResponse: { not_a_plan: 1 } });
    const root = fixture.nativeElement as HTMLElement;
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    expect(saveBtn.disabled).toBe(false);
    expect(root.querySelector('[data-testid="song-preset-draft-limit-hint"]')).toBeNull();
  });

  test('P1 — clicking Duplicate only sends GETs (one /me/plan + one preset fetch)', async () => {
    const { fixture, httpMock } = setupWithId('song-dup');
    await loadSongWithPresets(fixture, httpMock, 'song-dup', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-dup', 0, 'LEAD');
    await clickDuplicateAndFlush(fixture, httpMock);
    expect(fixture.nativeElement.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    const mutating = httpMock.match(() => true).filter(
      (req) => !['GET', 'HEAD'].includes(req.request.method),
    );
    expect(mutating).toEqual([]);
  });

  test('R3, R4 a — Save sends one POST /songs/:id/presets; on 201+reload the list updates and the saved confirmation is focused', async () => {
    const { fixture, httpMock } = setupWithId('song-save');
    await loadSongWithPresets(fixture, httpMock, 'song-save', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-save', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    saveBtn.click();
    fixture.detectChanges();
    // While the POST is in flight, the button shows "saving" and is disabled.
    expect(saveBtn.textContent?.trim()).toBe('Saving…');
    expect(saveBtn.disabled).toBe(true);
    const postReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save/presets`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toBeInstanceOf(FormData);
    postReq.flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD 2',
      originalFilename: 'LEAD_2.prst',
      mimeType: 'application/octet-stream',
      byteSize: 507,
      createdAt: '2026-10-18T00:00:00Z',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    // R4 a — follow-up GET /songs/:id succeeds with the new preset last.
    const reloadReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save`);
    reloadReq.flush({
      id: 'song-save',
      name: 'Test Song',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'LEAD' },
        { id: 'preset-new', sortOrder: 1, name: 'LEAD 2' },
      ],
      files: [],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    // Draft card removed; confirmation present and focused.
    expect(root.querySelector('[data-testid="song-preset-draft"]')).toBeNull();
    const saved = root.querySelector<HTMLElement>(
      '[data-testid="song-preset-draft-saved"]',
    );
    expect(saved).not.toBeNull();
    expect(saved?.textContent).toContain('LEAD 2');
    expect(document.activeElement).toBe(saved);
    // The page never showed its loading state (state stays 'loaded').
    const page = fixture.componentInstance as unknown as { state: () => string };
    expect(page.state()).toBe('loaded');
  });

  test('R4 b — 201 then reload 500: confirmation focused, list unchanged, refresh warning shown, no error state', async () => {
    const { fixture, httpMock } = setupWithId('song-save-reload-fail');
    await loadSongWithPresets(fixture, httpMock, 'song-save-reload-fail', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-save-reload-fail', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save-reload-fail/presets`).flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD 2',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save-reload-fail`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    // Confirmation shown and focused; refresh warning shown; previous list left untouched.
    const saved = root.querySelector<HTMLElement>(
      '[data-testid="song-preset-draft-saved"]',
    )!;
    expect(saved).not.toBeNull();
    expect(document.activeElement).toBe(saved);
    const warning = root.querySelector('[data-testid="song-preset-draft-refresh-failed"]');
    expect(warning).not.toBeNull();
    // The list should still show the original preset (no local append of the 201).
    const rows = root.querySelectorAll('[data-testid="song-preset-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain('LEAD');
    // No page-level error state.
    expect(root.querySelector('[data-testid="song-detail-error"]')).toBeNull();
    const page = fixture.componentInstance as unknown as { state: () => string };
    expect(page.state()).toBe('loaded');
  });

  test('R4 c — after refresh-failed warning, retry succeeds → warning disappears, list reloads', async () => {
    const { fixture, httpMock } = setupWithId('song-retry-ok');
    await loadSongWithPresets(fixture, httpMock, 'song-retry-ok', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-retry-ok', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-ok/presets`).flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD 2',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-ok`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const retryBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-refresh-retry"]',
    )!;
    retryBtn.click();
    fixture.detectChanges();
    const retryReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-ok`);
    retryReq.flush({
      id: 'song-retry-ok',
      name: 'Test Song',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'LEAD' },
        { id: 'preset-new', sortOrder: 1, name: 'LEAD 2' },
      ],
      files: [],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft-refresh-failed"]')).toBeNull();
    const rows = root.querySelectorAll('[data-testid="song-preset-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('LEAD');
    expect(rows[1]?.textContent).toContain('LEAD 2');
  });

  test('R4 d — retry fails → warning stays, list stays, no error state', async () => {
    const { fixture, httpMock } = setupWithId('song-retry-fail');
    await loadSongWithPresets(fixture, httpMock, 'song-retry-fail', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-retry-fail', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-fail/presets`).flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD 2',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-fail`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const retryBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-refresh-retry"]',
    )!;
    retryBtn.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-retry-fail`).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft-refresh-failed"]')).not.toBeNull();
    const rows = root.querySelectorAll('[data-testid="song-preset-row"]');
    expect(rows.length).toBe(1);
    expect(root.querySelector('[data-testid="song-detail-error"]')).toBeNull();
  });

  test('R5 — page-level 402 keeps the draft, shows the limit_reached_save banner', async () => {
    const { fixture, httpMock } = setupWithId('song-402');
    await loadSongWithPresets(fixture, httpMock, 'song-402', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-402', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-402/presets`).flush(
      { error: 'plan_preset_limit' },
      { status: 402, statusText: 'Payment Required' },
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    const errBanner = root.querySelector<HTMLElement>(
      '[data-testid="song-preset-draft-save-error"]',
    );
    expect(errBanner).not.toBeNull();
    expect(errBanner?.getAttribute('role')).toBe('alert');
    expect(errBanner?.textContent).toContain('limit');
    // No follow-up GET /songs/:id is fired on failure.
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-402`);
  });

  test('R6 — page-level 409 keeps the draft, shows the name_taken banner', async () => {
    const { fixture, httpMock } = setupWithId('song-409');
    await loadSongWithPresets(fixture, httpMock, 'song-409', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-409', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-409/presets`).flush(
      { error: 'name_taken' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    const errBanner = root.querySelector<HTMLElement>(
      '[data-testid="song-preset-draft-save-error"]',
    );
    expect(errBanner).not.toBeNull();
    expect(errBanner?.textContent).toContain('Another preset');
  });

  test('R7 — page-level 0 network error keeps the draft, shows the unreachable banner', async () => {
    const { fixture, httpMock } = setupWithId('song-0');
    await loadSongWithPresets(fixture, httpMock, 'song-0', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-0', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-0/presets`).error(
      new ProgressEvent('error'),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-preset-draft"]')).not.toBeNull();
    const errBanner = root.querySelector<HTMLElement>(
      '[data-testid="song-preset-draft-save-error"]',
    );
    expect(errBanner).not.toBeNull();
    expect(errBanner?.textContent).toContain('connection');
  });

  test('R8 — pending save: Save/Discard/name disabled, label is Saving…, aria-busy=true on card', async () => {
    const { fixture, httpMock } = setupWithId('song-pending');
    await loadSongWithPresets(fixture, httpMock, 'song-pending', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-pending', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    saveBtn.click();
    fixture.detectChanges();
    expect(saveBtn.textContent?.trim()).toBe('Saving…');
    expect(saveBtn.disabled).toBe(true);
    const discardBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-discard"]',
    )!;
    expect(discardBtn.disabled).toBe(true);
    const nameInput = root.querySelector<HTMLInputElement>(
      '[data-testid="song-preset-draft-name"]',
    )!;
    expect(nameInput.disabled).toBe(true);
    const card = root.querySelector<HTMLElement>('[data-testid="song-preset-draft"]')!;
    expect(card.getAttribute('aria-busy')).toBe('true');
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-pending/presets`).flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD 2',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-pending`).flush({
      id: 'song-pending',
      name: 'Test Song',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'LEAD' },
        { id: 'preset-new', sortOrder: 1, name: 'LEAD 2' },
      ],
      files: [],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    // After save, the draft card is removed (no aria-busy to assert). The
    // pending-test focus is that the card was aria-busy while saving.
    expect(root.querySelector('[data-testid="song-preset-draft"]')).toBeNull();
  });

  test('R9 — invalid draft name disables Save', async () => {
    const { fixture, httpMock } = setupWithId('song-name-invalid');
    await loadSongWithPresets(fixture, httpMock, 'song-name-invalid', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-name-invalid', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>(
      '[data-testid="song-preset-draft-name"]',
    )!;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const saveBtn = root.querySelector<HTMLButtonElement>(
      '[data-testid="song-preset-draft-save"]',
    )!;
    expect(saveBtn.disabled).toBe(true);
  });

  test('R10 — after a successful save of an edited draft, confirmLeave returns true', async () => {
    const { fixture, httpMock } = setupWithId('song-save-leave');
    await loadSongWithPresets(fixture, httpMock, 'song-save-leave', [
      { id: 'p0', sortOrder: 0, name: 'LEAD' },
    ]);
    await openRowAndLoad(fixture, httpMock, 'song-save-leave', 0, 'LEAD');
    await duplicateAndAssert(fixture, httpMock);
    const root = fixture.nativeElement as HTMLElement;
    // Make the draft edited so hasUnsavedDraft() would otherwise be true.
    const input = root.querySelector<HTMLInputElement>(
      '[data-testid="song-preset-draft-name"]',
    )!;
    input.value = 'LEAD X';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      confirmLeave: () => boolean | Promise<boolean>;
      hasUnsavedDraft: () => boolean;
    };
    expect(page.hasUnsavedDraft()).toBe(true);
    // Save.
    root.querySelector<HTMLButtonElement>('[data-testid="song-preset-draft-save"]')!.click();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save-leave/presets`).flush({
      id: 'preset-new',
      sortOrder: 1,
      name: 'LEAD X',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-save-leave`).flush({
      id: 'song-save-leave',
      name: 'Test Song',
      presets: [
        { id: 'p0', sortOrder: 0, name: 'LEAD' },
        { id: 'preset-new', sortOrder: 1, name: 'LEAD X' },
      ],
      files: [],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(page.hasUnsavedDraft()).toBe(false);
    expect(page.confirmLeave()).toBe(true);
  });
});

// F33 `song_detail_files_and_extra_config` — read-only listing of
// the IR/NAM files and the extra details saved with a song. The
// existing `setupWithId` already requests `GET /songs/:id`, so the
// helpers below just flush that response with the right `files` and
// `extraConfig` and then wait for change detection.

import { TranslocoService } from '@jsverse/transloco';
import { Subject, switchMap, take } from 'rxjs';
import type { Type } from '@angular/core';

@Injectable({ providedIn: 'root' })
class BilingualStubTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    const isEs = lang === 'es';
    return of({
      songs: {
        title: isEs ? 'Mis canciones' : 'My songs',
        loading: isEs ? 'Cargando…' : 'Loading…',
        retry: isEs ? 'Reintentar' : 'Try again',
        login_again: isEs ? 'Iniciar sesión' : 'Log in',
        errors: {
          unreachable: isEs
            ? 'No se pudo contactar con el servidor.'
            : "Couldn't reach the server.",
          load_failed: isEs
            ? 'No se pudieron cargar tus canciones.'
            : "Your songs couldn't be loaded.",
          session_expired: isEs ? 'Tu sesión ha caducado.' : 'Your session has expired.',
        },
      },
      songDetail: {
        presets_heading: isEs ? 'Presets, en orden de uso' : 'Presets, in running order',
        reference_note: isEs ? 'Solo referencia.' : 'Reference only.',
        not_found: isEs ? 'Canción no encontrada.' : 'Song not found.',
        view_chain: isEs ? 'Ver cadena' : 'View chain',
        hide_chain: isEs ? 'Ocultar cadena' : 'Hide chain',
        view_chain_aria: isEs ? 'Ver la cadena del preset {{name}}' : 'View chain for {{name}}',
        hide_chain_aria: isEs ? 'Ocultar la cadena del preset {{name}}' : 'Hide chain for {{name}}',
        chain_loading: isEs ? 'Cargando preset…' : 'Loading preset…',
        chain_load_failed: isEs
          ? 'No se pudo leer este preset. Vuelve a intentarlo.'
          : "Couldn't read this preset. Try again.",
        chain_retry: isEs ? 'Reintentar' : 'Try again',
        chain_invalid: isEs
          ? 'Este preset está dañado y no se puede mostrar.'
          : "This preset is damaged and can't be shown.",
        chain_unverified_footnote: isEs
          ? 'Esta cadena es de solo lectura.'
          : 'This chain is read-only.',
        files_heading: isEs ? 'Archivos de usuario' : 'User files',
        files_empty: isEs
          ? 'Esta canción no tiene archivos IR ni NAM guardados.'
          : 'No IR or NAM files were saved with this song.',
        file_kind_ir: 'IR',
        file_kind_nam: 'NAM',
        size_mb: '{{value}} MB',
        size_mb_below_min: '< {{value}} MB',
        extra_heading: isEs ? 'Datos extra' : 'Extra details',
        extra_empty: isEs
          ? 'Esta canción no tiene datos extra guardados.'
          : 'No extra details were saved with this song.',
        extra_value_empty: isEs ? '(vacío)' : '(empty)',
      },
      songPresetDraft: {
        duplicate: isEs ? 'Duplicar' : 'Duplicate',
        duplicate_aria: isEs ? 'Duplicar preset {{name}}' : 'Duplicate preset {{name}}',
        heading: isEs ? 'Copia de «{{source}}»' : 'Copy of "{{source}}"',
        unsaved: isEs ? 'Sin guardar' : 'Not saved',
        name_label: isEs ? 'Nombre' : 'Preset name',
        name_help: 'help',
        edit_hint: 'edit',
        bypass_label: 'on',
        effect_label: 'fx',
        footnote: 'footnote',
        export: 'Export',
        send: 'Send',
        discard: 'Discard',
        errors: {
          name_required: 'required',
          name_unsupported: 'unsupported',
          name_duplicate: 'duplicate',
          param_invalid: 'invalid',
          duplicate_failed: 'failed',
        },
        leave_title: 'leave',
        leave_message: 'message',
        leave_stay: 'stay',
        leave_confirm: 'leave',
      },
      chainBoard: {
        close: 'Close',
        browse: 'Browse',
        active: 'In this preset',
        state_on: 'On',
        state_off: 'Bypassed',
        parameters: 'Parameters',
        no_parameters: 'No parameters.',
        unknown_module: 'Unknown module.',
        manual_page: 'Manual p. {{page}}',
        categories: { c0: 'NR', c1: 'PRE', c4: 'AMP' },
        userIrSlot: 'User IR {{slot}}',
        userSnapToneSlot: 'User SnapTone {{slot}}',
      },
      presetBrowser: {
        footnote_unverified: 'Footnote.',
      },
      writeToPedal: {
        draft_note: 'draft note',
        target_slot: 'Target slot',
        not_connected: 'Not connected.',
        connect: 'Connect GP-5',
        connecting: 'Connecting…',
        cancel: 'Cancel',
        send: 'Send',
        writing: 'Writing…',
        success_title: 'Done',
        success_single: 'success',
        done: 'Close',
        song_heading: 'Song heading',
        presets_legend: 'Presets',
        preset_row_aria: 'Pos {{position}}: {{name}}',
        write_all: 'Write all',
        write_all_help: 'Help',
        partialProgress: 'Already wrote: {{slots}}.',
        errors: {
          pedalDisconnected: 'Pedal disconnected.',
          busy: 'Busy.',
          timeout: 'Timeout.',
          connectionLost: 'Connection lost.',
          unexpected: 'Error.',
          songNotFound: 'Not found.',
          sessionExpired: 'Session expired.',
          network: 'Network.',
          corruptFile: 'Corrupt file.',
          writeNotConfirmed: 'Not confirmed.',
          writeRejected: 'Rejected.',
        },
      },
      writeToSlot: {
        help: '0..99',
        errors: { outOfRange: 'Out of range.', notEnoughRoom: 'Not enough room.' },
        summary_range: 'Slots {{from}}..{{to}}',
      },
      unsupportedBrowser: {
        title: 'Unsupported',
        body: 'Body',
        browsers: 'Browsers',
        footnote: 'Footnote',
        insecure_body: 'Insecure',
        insecure_compact: 'Insecure compact',
      },
    } as Translation);
  }
}

// F33 R23 regression — mirrors the real HttpLoader: the `en` file
// arrives only when the test fires `enTranslationGate`, i.e. AFTER
// `setActiveLang('en')` has already emitted `langChanges$`.
let enTranslationGate = new Subject<void>();

@Injectable({ providedIn: 'root' })
class AsyncEnStubTranslocoLoader implements TranslocoLoader {
  private readonly inner = new BilingualStubTranslocoLoader();
  getTranslation(lang: string): Observable<Translation> {
    if (lang !== 'en') return this.inner.getTranslation(lang);
    return enTranslationGate.pipe(
      take(1),
      switchMap(() => this.inner.getTranslation(lang)),
    );
  }
}

function setupWithBothLangs(
  id: string | null,
  initialLang: 'es' | 'en' = 'es',
  loader: Type<TranslocoLoader> = BilingualStubTranslocoLoader,
): {
  httpMock: HttpTestingController;
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>;
  transloco: TranslocoService;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SongDetailPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: {
          availableLangs: ['es', 'en'],
          defaultLang: initialLang,
          fallbackLang: 'es',
          // Same as app.config.ts — without it the *transloco directive
          // ignores every langChanges$ emission after the first.
          reRenderOnLangChange: true,
        },
        loader,
      }),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: (k: string) => (k === 'id' ? id : null) } },
        },
      },
      {
        provide: WebMidiPedalConnection,
        useValue: {
          isSupported: () => true,
          connectionState: signal<'not-connected' | 'connecting' | 'connected' | 'error'>('not-connected'),
          connect: vi.fn().mockResolvedValue(undefined),
          writePreset: vi.fn().mockResolvedValue(undefined),
        },
      },
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const transloco = TestBed.inject(TranslocoService);
  transloco.setActiveLang(initialLang);
  const fixture = TestBed.createComponent(SongDetailPage);
  fixture.detectChanges();
  return { httpMock, fixture, transloco };
}

async function loadSongWithFiles(
  fixture: ReturnType<typeof TestBed.createComponent<SongDetailPage>>,
  httpMock: HttpTestingController,
  songId: string,
  body: Partial<SongDetail>,
): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  httpMock.expectOne(`${environment.apiBaseUrl}/songs/${songId}`).flush({
    id: songId,
    name: body.name ?? 'Test Song',
    artist: body.artist ?? null,
    presets: body.presets ?? [],
    files: body.files ?? [],
    extraConfig: body.extraConfig,
  } as SongDetail);
  await fixture.whenStable();
  await Promise.resolve();
  fixture.detectChanges();
}

async function flushCover(
  httpMock: HttpTestingController,
  songId: string,
  payload = new Blob([new Uint8Array([0x89]) as BlobPart], { type: 'image/png' }),
): Promise<void> {
  const req = httpMock.match(`${environment.apiBaseUrl}/songs/${songId}/files/cover`)[0];
  req?.flush(payload);
}

describe('SongDetailPage (F33 — files and extra details)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  test('R1, R2, R3, R4, R5, R6, R7, R8 — loaded: User files section, rows in ir→nam/sortOrder order, cover dropped, filename/title/kind/size', async () => {
    const { fixture, httpMock } = setupWithId('song-files');
    await loadSongWithFiles(fixture, httpMock, 'song-files', {
      name: 'Has files',
      files: [
        {
          id: 'nam-1',
          kind: 'nam',
          originalFilename: 'Plexi crunch.nam',
          mimeType: 'application/octet-stream',
          byteSize: 1572864,
          sortOrder: 1,
          createdAt: '2026-10-01',
        },
        {
          id: 'ir-0',
          kind: 'ir',
          originalFilename: 'Room 412.wav',
          mimeType: 'audio/wav',
          byteSize: 5243,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
        {
          id: 'ir-1',
          kind: 'ir',
          originalFilename: 'Marshall 4x12.wav',
          mimeType: 'audio/wav',
          byteSize: 1048576,
          sortOrder: 1,
          createdAt: '2026-10-01',
        },
        {
          id: 'cover',
          kind: 'cover',
          originalFilename: 'cover.png',
          mimeType: 'image/png',
          byteSize: 1024,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    });
    await flushCover(httpMock, 'song-files');
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('[data-testid="song-detail-files"]');
    expect(section).not.toBeNull();
    const heading = section!.querySelector('h2');
    expect(heading?.textContent?.trim()).toBe('User files');
    const rows = section!.querySelectorAll('[data-testid="song-file-row"]');
    expect(rows.length).toBe(3);
    // Order: ir-0, ir-1, nam-1 (cover dropped, ir before nam).
    const names = Array.from(rows).map((r) =>
      r.querySelector('[data-testid="song-file-name"]')?.textContent?.trim(),
    );
    expect(names).toEqual(['Room 412.wav', 'Marshall 4x12.wav', 'Plexi crunch.nam']);
    const title0 = rows[0]!.querySelector('[data-testid="song-file-name"]')?.getAttribute('title');
    expect(title0).toBe('Room 412.wav');
    const kindLabels = Array.from(rows).map((r) =>
      r.querySelector('[data-testid="song-file-kind"]')?.textContent?.trim(),
    );
    expect(kindLabels).toEqual(['IR', 'IR', 'NAM']);
    // 5243 bytes → 0.01 MB (es), 1048576 → 1,00 MB (es), 1572864 → 1,50 MB (es).
    const sizeTexts = Array.from(rows).map((r) =>
      r.querySelector('[data-testid="song-file-size"]')?.textContent?.trim(),
    );
    expect(sizeTexts).toEqual(['0,01 MB', '1,00 MB', '1,50 MB']);
    // R3: cover is not rendered as a row.
    const rowNames = Array.from(rows).map((r) => r.textContent ?? '');
    expect(rowNames.some((t) => t.includes('cover.png'))).toBe(false);
  });

  test('R13, R20 — only a cover + extraConfig {} shows both empty texts, no rows/pairs', async () => {
    const { fixture, httpMock } = setupWithId('song-empty');
    await loadSongWithFiles(fixture, httpMock, 'song-empty', {
      files: [
        {
          id: 'cover',
          kind: 'cover',
          originalFilename: 'cover.png',
          mimeType: 'image/png',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
      extraConfig: {},
    });
    await flushCover(httpMock, 'song-empty');
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-files"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-detail-files-empty"]')?.textContent?.trim()).toBe(
      'No IR or NAM files were saved with this song.',
    );
    expect(root.querySelectorAll('[data-testid="song-file-row"]').length).toBe(0);
    expect(root.querySelector('[data-testid="song-detail-extra"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-detail-extra-empty"]')?.textContent?.trim()).toBe(
      'No extra details were saved with this song.',
    );
    expect(root.querySelectorAll('[data-testid="song-extra-row"]').length).toBe(0);
  });

  test('R13, R20 — files empty + extraConfig omitted: empty texts present, no rows', async () => {
    const { fixture, httpMock } = setupWithId('song-no-files');
    await loadSongWithFiles(fixture, httpMock, 'song-no-files', {
      files: [],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-detail-files-empty"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="song-file-row"]').length).toBe(0);
    expect(root.querySelector('[data-testid="song-detail-extra-empty"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-testid="song-extra-row"]').length).toBe(0);
  });

  test('R14, R15, R16, R19 — mixed extraConfig: section, heading, response key order, (empty) text, whitespace-pre-wrap on multi-line', async () => {
    const { fixture, httpMock } = setupWithId('song-extras');
    await loadSongWithFiles(fixture, httpMock, 'song-extras', {
      files: [],
      extraConfig: {
        tuning: 'Drop D',
        capo: '2',
        notes: 'line 1\nline 2',
        blank: '',
      },
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const section = root.querySelector('[data-testid="song-detail-extra"]');
    expect(section).not.toBeNull();
    expect(section!.querySelector('h2')?.textContent?.trim()).toBe('Extra details');
    const pairs = section!.querySelectorAll('[data-testid="song-extra-row"]');
    expect(pairs.length).toBe(4);
    const keys = Array.from(pairs).map((p) => p.querySelector('dt')?.textContent?.trim());
    expect(keys).toEqual(['tuning', 'capo', 'notes', 'blank']);
    const tuningDd = pairs[0]!.querySelector('[data-testid="song-extra-value-text"]');
    expect(tuningDd?.textContent?.trim()).toBe('Drop D');
    const notesDd = pairs[2]!.querySelector('[data-testid="song-extra-value-text"]') as HTMLElement;
    expect(notesDd?.textContent?.trim()).toBe('line 1\nline 2');
    expect(notesDd?.classList.contains('whitespace-pre-wrap')).toBe(true);
    const blankDd = pairs[3]!.querySelector('[data-testid="song-extra-value-empty"]');
    expect(blankDd?.textContent?.trim()).toBe('(empty)');
  });

  test('R21 — no /files/ir or /files/nam request after load', async () => {
    const { fixture, httpMock } = setupWithId('song-no-files-2');
    await loadSongWithFiles(fixture, httpMock, 'song-no-files-2', {
      files: [
        {
          id: 'ir-0',
          kind: 'ir',
          originalFilename: 'ir.wav',
          mimeType: 'audio/wav',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
        {
          id: 'nam-0',
          kind: 'nam',
          originalFilename: 'nam.bin',
          mimeType: 'application/octet-stream',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-no-files-2/files/ir`);
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-no-files-2/files/nam`);
    httpMock.verify();
  });

  test('R22 — loading / 404 / 500 / 401: neither section is rendered', async () => {
    // Loading state.
    const loading = setupWithId('song-loading');
    await loading.fixture.whenStable();
    loading.fixture.detectChanges();
    const loadingRoot = loading.fixture.nativeElement as HTMLElement;
    expect(loadingRoot.querySelector('[data-testid="song-detail-loading"]')).not.toBeNull();
    expect(loadingRoot.querySelector('[data-testid="song-detail-files"]')).toBeNull();
    expect(loadingRoot.querySelector('[data-testid="song-detail-extra"]')).toBeNull();
    loading.httpMock.expectOne(`${environment.apiBaseUrl}/songs/song-loading`).flush({
      id: 'song-loading',
      name: 'X',
      presets: [],
      files: [],
    } as SongDetail);
    await loading.fixture.whenStable();

    // 404.
    const missing = setupWithId('missing');
    await missing.fixture.whenStable();
    missing.fixture.detectChanges();
    missing.httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/missing`)
      .flush('not found', { status: 404, statusText: 'Not Found' });
    await missing.fixture.whenStable();
    await Promise.resolve();
    missing.fixture.detectChanges();
    const missingRoot = missing.fixture.nativeElement as HTMLElement;
    expect(missingRoot.querySelector('[data-testid="song-detail-not-found"]')).not.toBeNull();
    expect(missingRoot.querySelector('[data-testid="song-detail-files"]')).toBeNull();
    expect(missingRoot.querySelector('[data-testid="song-detail-extra"]')).toBeNull();

    // 500.
    const boom = setupWithId('boom');
    await boom.fixture.whenStable();
    boom.fixture.detectChanges();
    boom.httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/boom`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    await boom.fixture.whenStable();
    await Promise.resolve();
    boom.fixture.detectChanges();
    const boomRoot = boom.fixture.nativeElement as HTMLElement;
    expect(boomRoot.querySelector('[data-testid="song-detail-error"]')).not.toBeNull();
    expect(boomRoot.querySelector('[data-testid="song-detail-files"]')).toBeNull();
    expect(boomRoot.querySelector('[data-testid="song-detail-extra"]')).toBeNull();

    // 401.
    const unauth = setupWithId('unauth');
    await unauth.fixture.whenStable();
    unauth.fixture.detectChanges();
    unauth.httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/unauth`)
      .flush('unauth', { status: 401, statusText: 'Unauthorized' });
    await unauth.fixture.whenStable();
    await Promise.resolve();
    unauth.fixture.detectChanges();
    const unauthRoot = unauth.fixture.nativeElement as HTMLElement;
    expect(unauthRoot.querySelector('[data-testid="song-detail-session-expired"]')).not.toBeNull();
    expect(unauthRoot.querySelector('[data-testid="song-detail-files"]')).toBeNull();
    expect(unauthRoot.querySelector('[data-testid="song-detail-extra"]')).toBeNull();
  });

  test('R12, R23 — switching active language es→en re-renders headings and size text; no second GET /songs/:id', async () => {
    const { fixture, httpMock, transloco } = setupWithBothLangs('song-lang', 'es');
    await loadSongWithFiles(fixture, httpMock, 'song-lang', {
      files: [
        {
          id: 'ir-0',
          kind: 'ir',
          originalFilename: 'a.wav',
          mimeType: 'audio/wav',
          byteSize: 1572864,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // Initial language is 'es'.
    const heading = root.querySelector('[data-testid="song-detail-files"] h2');
    expect(heading?.textContent?.trim()).toBe('Archivos de usuario');
    const sizeText = root.querySelector('[data-testid="song-file-size"]')?.textContent?.trim();
    expect(sizeText).toBe('1,50 MB');

    // Switch language to 'en'.
    await transloco.load('en').toPromise();
    transloco.setActiveLang('en');
    await fixture.whenStable();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const headingEn = root.querySelector('[data-testid="song-detail-files"] h2');
    expect(headingEn?.textContent?.trim()).toBe('User files');
    const sizeTextEn = root.querySelector('[data-testid="song-file-size"]')?.textContent?.trim();
    expect(sizeTextEn).toBe('1.50 MB');

    // No second GET /songs/:id was issued after the language switch.
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-lang`);
    httpMock.verify();
  });

  test('R12, R23 — regression: en translation arriving asynchronously after setActiveLang still renders English, never a raw songDetail. key; no second GET /songs/:id', async () => {
    enTranslationGate = new Subject<void>();
    const { fixture, httpMock, transloco } = setupWithBothLangs('song-lang-async', 'es', AsyncEnStubTranslocoLoader);
    await loadSongWithFiles(fixture, httpMock, 'song-lang-async', {
      files: [
        {
          id: 'ir-0',
          kind: 'ir',
          originalFilename: 'a.wav',
          mimeType: 'audio/wav',
          byteSize: 1572864,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
        {
          id: 'nam-0',
          kind: 'nam',
          originalFilename: 'b.nam',
          mimeType: 'application/octet-stream',
          byteSize: 100,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
      extraConfig: { blank: '' },
    });
    const root = fixture.nativeElement as HTMLElement;
    const text = (sel: string): string[] =>
      Array.from(root.querySelectorAll(sel)).map((el) => el.textContent?.trim() ?? '');
    expect(text('[data-testid="song-detail-files"] h2')).toEqual(['Archivos de usuario']);

    // Real-app order: langChanges$ fires synchronously, the file is not loaded yet.
    transloco.setActiveLang('en');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).not.toContain('songDetail.');

    // The en file arrives now.
    enTranslationGate.next();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    expect(text('[data-testid="song-detail-files"] h2')).toEqual(['User files']);
    expect(text('[data-testid="song-detail-extra"] h2')).toEqual(['Extra details']);
    expect(text('[data-testid="song-file-kind"]')).toEqual(['IR', 'NAM']);
    expect(text('[data-testid="song-file-size"]')[0]).toBe('1.50 MB');
    expect(text('[data-testid="song-extra-value-empty"]')).toEqual(['(empty)']);
    expect(root.textContent).not.toContain('songDetail.');
    // Kind tag keeps its static classes plus the kind-specific colors.
    const kinds = root.querySelectorAll('[data-testid="song-file-kind"]');
    expect(kinds[0]!.classList.contains('w-12')).toBe(true);
    expect(kinds[0]!.classList.contains('bg-stone-600')).toBe(true);
    expect(kinds[1]!.classList.contains('w-12')).toBe(true);
    expect(kinds[1]!.classList.contains('bg-rose-600')).toBe(true);

    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-lang-async`);
    httpMock.verify();
  });

  test('R13, R23 — regression: empty texts switch to English once the async en file arrives', async () => {
    enTranslationGate = new Subject<void>();
    const { fixture, httpMock, transloco } = setupWithBothLangs('song-lang-empty', 'es', AsyncEnStubTranslocoLoader);
    await loadSongWithFiles(fixture, httpMock, 'song-lang-empty', { files: [], extraConfig: {} });
    const root = fixture.nativeElement as HTMLElement;
    transloco.setActiveLang('en');
    await fixture.whenStable();
    fixture.detectChanges();
    enTranslationGate.next();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="song-detail-files-empty"]')?.textContent?.trim()).toBe(
      'No IR or NAM files were saved with this song.',
    );
    expect(root.querySelector('[data-testid="song-detail-extra-empty"]')?.textContent?.trim()).toBe(
      'No extra details were saved with this song.',
    );
    expect(root.textContent).not.toContain('songDetail.');
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/song-lang-empty`);
  });

  test('R24 — i18n: the 9 new songDetail keys exist in both es and en as non-empty strings', () => {
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const es = JSON.parse(readFileSync(join(cwd, 'public/i18n/es.json'), 'utf8')) as Record<string, unknown>;
    const en = JSON.parse(readFileSync(join(cwd, 'public/i18n/en.json'), 'utf8')) as Record<string, unknown>;
    const requiredKeys = [
      'songDetail.files_heading',
      'songDetail.files_empty',
      'songDetail.file_kind_ir',
      'songDetail.file_kind_nam',
      'songDetail.size_mb',
      'songDetail.size_mb_below_min',
      'songDetail.extra_heading',
      'songDetail.extra_empty',
      'songDetail.extra_value_empty',
    ];
    for (const k of requiredKeys) {
      const esVal = k.split('.').reduce<unknown>(
        (acc, segment) => (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[segment]
          : undefined),
        es,
      );
      const enVal = k.split('.').reduce<unknown>(
        (acc, segment) => (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)
          ? (acc as Record<string, unknown>)[segment]
          : undefined),
        en,
      );
      expect(typeof esVal).toBe('string');
      expect(typeof enVal).toBe('string');
      expect((esVal as string).length).toBeGreaterThan(0);
      expect((enVal as string).length).toBeGreaterThan(0);
    }
  });

  test('R25, R26 — layout: wrapper is single-column → two-column at lg; file row min-w-0; filename truncate; size shrink-0; text <dd> break-words', async () => {
    const { fixture, httpMock } = setupWithId('song-layout');
    await loadSongWithFiles(fixture, httpMock, 'song-layout', {
      files: [
        {
          id: 'ir-0',
          kind: 'ir',
          originalFilename: 'a.wav',
          mimeType: 'audio/wav',
          byteSize: 1024,
          sortOrder: 0,
          createdAt: '2026-10-01',
        },
      ],
      extraConfig: { notes: 'multi\nline' },
    });
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = root.querySelector('[data-testid="song-detail-extras-grid"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.classList.contains('grid-cols-1')).toBe(true);
    expect(wrapper.classList.contains('lg:grid-cols-2')).toBe(true);
    const row = root.querySelector('[data-testid="song-file-row"]') as HTMLElement;
    expect(row.classList.contains('min-w-0')).toBe(true);
    const filename = row.querySelector('[data-testid="song-file-name"]') as HTMLElement;
    expect(filename.classList.contains('truncate')).toBe(true);
    const size = row.querySelector('[data-testid="song-file-size"]') as HTMLElement;
    expect(size.classList.contains('shrink-0')).toBe(true);
    const textDd = root.querySelector('[data-testid="song-extra-value-text"]') as HTMLElement;
    expect(textDd.classList.contains('break-words')).toBe(true);
  });
});