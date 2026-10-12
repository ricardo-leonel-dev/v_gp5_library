import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';
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
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SongDetailPage } from './song-detail-page';
import { SongsApi } from '../songs-api.service';
import { environment } from '../../../environments/environment';
import type { SongDetail } from '../song';

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