import { describe, expect, test, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import {
  provideTransloco,
  type Translation,
  type TranslocoLoader,
} from '@jsverse/transloco';
import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SongPedalsSection } from './song-pedals-section';
import { environment } from '../../../environments/environment';
import type { CatalogPedal, SongPedal } from '../pedal-catalog';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({
      songPedals: {
        heading: 'Pedals',
        attach_open: 'Attach pedal',
        empty: 'No pedals attached to this song yet.',
        pedal_unavailable: 'Pedal no longer in the catalog',
        catalog_legend: 'Pedal catalog',
        catalog_empty: 'The catalog has no pedals yet.',
        pedal_hint: 'Choose a pedal from the catalog.',
        label_field: 'Label',
        label_placeholder: 'e.g. Solo boost',
        label_counter: '{{count}}/255',
        attach: 'Attach',
        attaching: 'Attaching…',
        cancel: 'Cancel',
        attached: 'Pedal attached to the song.',
        detach: 'Detach',
        detach_aria: 'Detach {{label}} from this song',
        detach_confirm: 'Detach "{{label}}" from this song? The pedal stays in the catalog.',
        detach_confirm_yes: 'Detach',
        detach_keep: 'Keep',
        detaching: 'Detaching…',
        detached: 'Pedal detached from the song.',
        retry: 'Try again',
        login_again: 'Log in',
        errors: {
          unreachable: "Couldn't reach the server. Check your connection and try again.",
          session_expired: 'Your session has expired.',
          song_not_found: 'This song no longer exists in your library.',
          load_failed: "Couldn't load this song's pedals.",
          catalog_failed: "Couldn't load the pedal catalog.",
          label_required: 'Enter a label for this pedal.',
          label_too_long: 'Use 255 characters or fewer.',
          pedal_gone: 'That pedal was removed from the catalog. Choose another one.',
          attach_failed: "Couldn't attach the pedal. Try again.",
          already_detached: 'That pedal was already detached from this song.',
          detach_failed: "Couldn't detach the pedal. Try again.",
        },
      },
    } as Translation);
  }
}

function setup(songId: string): {
  httpMock: HttpTestingController;
  fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SongPedalsSection],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
    ],
  });
  const httpMock = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(SongPedalsSection);
  fixture.componentRef.setInput('songId', songId);
  fixture.detectChanges();
  return { httpMock, fixture };
}

function songPedal(overrides: Partial<SongPedal> = {}): SongPedal {
  return {
    id: overrides.id ?? 'c1',
    songId: overrides.songId ?? 's1',
    pedalCatalogId: overrides.pedalCatalogId ?? 'p1',
    label: overrides.label ?? 'Lead',
    config: overrides.config ?? {},
    createdAt: overrides.createdAt ?? '2026-10-18T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-10-18T00:00:00Z',
    ...overrides,
  };
}

function catalogPedal(overrides: Partial<CatalogPedal> = {}): CatalogPedal {
  return {
    id: overrides.id ?? 'p1',
    name: overrides.name ?? 'Lead boost',
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? '2026-10-18T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-10-18T00:00:00Z',
    ...overrides,
  };
}

async function settle(fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>): Promise<void> {
  await fixture.whenStable();
  await Promise.resolve();
  fixture.detectChanges();
}

async function loadSection(
  fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>,
  httpMock: HttpTestingController,
  options: { songPedals?: SongPedal[]; catalog?: CatalogPedal[] } = {},
): Promise<void> {
  const pedalsReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`);
  const catalogReq = httpMock.expectOne(`${environment.apiBaseUrl}/pedals`);
  pedalsReq.flush(options.songPedals ?? []);
  catalogReq.flush(options.catalog ?? []);
  await settle(fixture);
}

// F36 R3 a — on create, exactly one GET /songs/<id>/pedals and one GET /pedals.
describe('SongPedalsSection (F36 R3 a — initial requests)', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R3 a — on create, exactly one GET /songs/<id>/pedals and one GET /pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    httpMock.verify();
  });
});

// F36 R1 — attached rows in response order, name lookup with catalog missing/pending.
describe('F36 R1 — attached pedals list', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R1 a — renders 2 rows in response order with label + name', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [
        songPedal({ id: 'c2', label: 'Rhythm', pedalCatalogId: 'p2' }),
        songPedal({ id: 'c1', label: 'Lead', pedalCatalogId: 'p1' }),
      ],
      catalog: [
        catalogPedal({ id: 'p1', name: 'Lead boost' }),
        catalogPedal({ id: 'p2', name: 'Rhythm drive' }),
      ],
    });
    const root = fixture.nativeElement as HTMLElement;
    const rows = root.querySelectorAll('[data-testid="song-pedal-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('data-song-pedal-id')).toBe('c2');
    expect(rows[1]?.getAttribute('data-song-pedal-id')).toBe('c1');
    expect(rows[0]?.querySelector('[data-testid="song-pedal-label"]')?.textContent?.trim()).toBe('Rhythm');
    expect(rows[0]?.querySelector('[data-testid="song-pedal-name"]')?.textContent?.trim()).toBe('Rhythm drive');
    expect(rows[1]?.querySelector('[data-testid="song-pedal-name"]')?.textContent?.trim()).toBe('Lead boost');
  });

  test('R1 b — name comes from the catalog', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ pedalCatalogId: 'p1' })],
      catalog: [catalogPedal({ id: 'p1', name: 'Boss DS-1' })],
    });
    const name = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="song-pedal-name"]');
    expect(name?.textContent?.trim()).toBe('Boss DS-1');
  });

  test('R1 c — catalog loaded but entry.pedalCatalogId missing → pedal_unavailable (italic)', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ pedalCatalogId: 'gone' })],
      catalog: [catalogPedal({ id: 'p1', name: 'Boss DS-1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    const name = root.querySelector('[data-testid="song-pedal-name"]');
    expect(name?.textContent?.trim()).toBe('Pedal no longer in the catalog');
    expect(name?.classList.contains('italic')).toBe(true);
  });

  test('R1 d — catalog still pending → no pedal name element on the row', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([songPedal()]);
    // Catalog not flushed → still loading.
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([catalogPedal()]);
    // The previous flow consumed both requests; replay:
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-pedal-row"]')).not.toBeNull();
    // Reset and run the actual scenario with pending catalog.
    TestBed.resetTestingModule();
    const { httpMock: hm2, fixture: f2 } = setup('s1');
    await settle(f2);
    hm2.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([songPedal()]);
    // Catalog still pending: don't flush it.
    await settle(f2);
    const root2 = f2.nativeElement as HTMLElement;
    expect(root2.querySelector('[data-testid="song-pedal-row"]')).not.toBeNull();
    expect(root2.querySelector('[data-testid="song-pedal-name"]')).toBeNull();
  });

  test('R1 d — catalog failed → no pedal name element on the row', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([songPedal()]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-pedal-row"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-pedal-name"]')).toBeNull();
  });
});

// F36 R2 — list loading / empty / error states.
describe('F36 R2 — attached list states', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R2 a — pending → loading region with aria-busy=true and no rows', async () => {
    const { fixture } = setup('s1');
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const loading = root.querySelector('[data-testid="song-pedals-loading"]');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[data-testid="song-pedal-row"]')).toBeNull();
  });

  test('R2 b — empty → empty state text', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, { songPedals: [], catalog: [] });
    const empty = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="song-pedals-empty"]');
    expect(empty?.textContent?.trim()).toBe('No pedals attached to this song yet.');
  });

  test('R2 c — status 0 → unreachable + retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).error(new ProgressEvent('error'));
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const err = root.querySelector('[data-testid="song-pedals-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain("Couldn't reach the server.");
    expect(root.querySelector('[data-testid="song-pedals-retry"]')).not.toBeNull();
  });

  test('R2 d — 404 → song_not_found + retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('not found', { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const err = root.querySelector('[data-testid="song-pedals-error"]');
    expect(err?.textContent).toContain('This song no longer exists');
    expect(root.querySelector('[data-testid="song-pedals-retry"]')).not.toBeNull();
  });

  test('R2 e — 500 → load_failed + retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const err = root.querySelector('[data-testid="song-pedals-error"]');
    expect(err?.textContent).toContain("Couldn't load this song's pedals.");
    expect(root.querySelector('[data-testid="song-pedals-retry"]')).not.toBeNull();
  });

  test('R2 f — 401 → session_expired + /login link, no retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('unauth', { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const expired = root.querySelector('[data-testid="song-pedals-session-expired"]');
    expect(expired).not.toBeNull();
    const link = expired!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
    expect(link.textContent?.trim()).toBe('Log in');
    expect(root.querySelector('[data-testid="song-pedals-retry"]')).toBeNull();
  });

  test('R2 g — retry sends a new GET /songs/<id>/pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).error(new ProgressEvent('error'));
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
    await settle(fixture);
    const retryBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedals-retry"]',
    )!;
    retryBtn.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
  });
});

// F36 R3 b-e — attach panel: 3 options, single selection, Cancel resets, aria-expanded.
describe('F36 R3 — attach panel', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R3 b — open panel renders 3 options in response order (incl. createdBy=null)', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [
        catalogPedal({ id: 'p1', name: 'A', createdBy: 'u1' }),
        catalogPedal({ id: 'p2', name: 'B', createdBy: null }),
        catalogPedal({ id: 'p3', name: 'C', createdBy: 'u3' }),
      ],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="open-attach-panel"]',
    )!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const options = root.querySelectorAll('[data-testid="catalog-option"]');
    expect(options.length).toBe(3);
    expect(options[0]?.querySelector('[data-testid="catalog-option-name"]')?.textContent?.trim()).toBe('A');
    expect(options[1]?.querySelector('[data-testid="catalog-option-name"]')?.textContent?.trim()).toBe('B');
    expect(options[2]?.querySelector('[data-testid="catalog-option-name"]')?.textContent?.trim()).toBe('C');
  });

  test('R3 c — selecting an option checks only that radio', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [
        catalogPedal({ id: 'p1', name: 'A' }),
        catalogPedal({ id: 'p2', name: 'B' }),
      ],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="open-attach-panel"]',
    )!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!).checked = true;
    (root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!).dispatchEvent(new Event('change'));
    await settle(fixture);
    expect((root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!).checked).toBe(true);
    expect((root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p2"]')!).checked).toBe(false);
  });

  test('R3 d — Cancel resets selection and label, no request sent', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!.checked = true;
    root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-cancel"]')!.click();
    await settle(fixture);
    // Panel closed.
    expect(root.querySelector('[data-testid="song-pedals-panel"]')).toBeNull();
    // Open it again: nothing selected, label empty.
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    expect((root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!).checked).toBe(false);
    expect((root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!).value).toBe('');
    // No extra request fired.
    httpMock.verify();
  });

  test('R3 e — aria-expanded false/true/false; focus returns to Attach pedal after Cancel and after 201', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, { catalog: [catalogPedal({ id: 'p1', name: 'A' })] });
    const root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    const open = root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!;
    expect(open.getAttribute('aria-expanded')).toBe('false');
    open.click();
    await settle(fixture);
    expect(root.querySelector('[data-testid="open-attach-panel"]')).toBe(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector(`#${open.getAttribute('aria-controls')}`)).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-cancel"]')!.click();
    await settle(fixture);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(open);
    // Successful attach (201) also closes the panel and restores focus.
    open.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock
      .expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`)
      .flush(songPedal({ id: 'c-new', label: 'Lead' }), { status: 201, statusText: 'Created' });
    await settle(fixture);
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(open);
    root.remove();
  });
});

// F36 R4 — catalog panel states.
describe('F36 R4 — catalog states', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R4 a — catalog pending → loading placeholder, Attach disabled', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    // Don't flush the catalog yet.
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="catalog-loading"]')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.disabled).toBe(true);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
  });

  test('R4 b — catalog empty (200 []) → empty text, Attach disabled, label input disabled', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, { songPedals: [], catalog: [] });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="catalog-empty"]')?.textContent?.trim()).toBe('The catalog has no pedals yet.');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!.disabled).toBe(true);
  });

  test('R4 c — catalog status 0 → unreachable + retry, Attach disabled', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).error(new ProgressEvent('error'));
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="catalog-error"]')?.textContent).toContain("Couldn't reach the server.");
    expect(root.querySelector('[data-testid="catalog-retry"]')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.disabled).toBe(true);
  });

  test('R4 d — catalog 401 → session_expired + /login link, no retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush('unauth', { status: 401, statusText: 'Unauthorized' });
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const err = root.querySelector('[data-testid="catalog-error"]')!;
    const link = err.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
    expect(root.querySelector('[data-testid="catalog-retry"]')).toBeNull();
  });

  test('R4 e — catalog 500 → catalog_failed + retry', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="catalog-error"]')?.textContent).toContain("Couldn't load the pedal catalog.");
    expect(root.querySelector('[data-testid="catalog-retry"]')).not.toBeNull();
  });

  test('R4 f — retry sends a new GET /pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="catalog-retry"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([]);
  });
});

// F36 R5 — draft validation surfacing in the DOM.
describe('F36 R5 — draft validation in the DOM', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R5 a — no pedal selected + valid label → hint shown, Attach disabled', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedals-pedal-hint"]')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.disabled).toBe(true);
  });

  test('R5 g — blank + blur → field error and aria-invalid=true', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.dispatchEvent(new Event('blur'));
    await settle(fixture);
    expect(label.getAttribute('aria-invalid')).toBe('true');
    const err = root.querySelector('[data-testid="song-pedals-label-error"]');
    expect(err?.textContent).toContain('Enter a label for this pedal.');
  });

  test('R5 h — 256-code-point label → label_too_long (no blur needed)', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'x'.repeat(256);
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    const err = root.querySelector('[data-testid="song-pedals-label-error"]');
    expect(err?.textContent).toContain('Use 255 characters or fewer.');
    expect(root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.disabled).toBe(true);
  });

  test('R5 i — invalid case → Attach disabled', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedals-attach"]',
    )!.disabled).toBe(true);
  });

  test('R5 — counter shows the trimmed code-point count', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const label = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="song-pedals-label"]',
    )!;
    label.value = '  Hello  ';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="song-pedals-label-counter"]',
    )?.textContent?.trim()).toBe('5/255');
  });
});

// F36 R6 — attach POST.
describe('F36 R6 — attach write', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R6 a — POST body has exactly the three keys, config={}', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = '  Lead boost  ';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    const postReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({
      pedal_catalog_id: 'p1',
      label: 'Lead boost',
      config: {},
    });
    postReq.flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead boost',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await settle(fixture);
  });

  test('R6 b — Attach shows "Attaching" and a second click sends nothing', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    const attachBtn = root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!;
    attachBtn.click();
    await settle(fixture);
    expect(attachBtn.textContent?.trim()).toBe('Attaching…');
    expect(attachBtn.disabled).toBe(true);
    attachBtn.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    httpMock.expectNone((req) => req.url === `${environment.apiBaseUrl}/songs/s1/pedals` && req.method === 'POST');
  });

  test('R6 c — 201 prepends the row, closes panel, resets draft, announces attached', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'Rhythm', pedalCatalogId: 'p2' })],
      catalog: [
        catalogPedal({ id: 'p1', name: 'Lead boost' }),
        catalogPedal({ id: 'p2', name: 'Rhythm drive' }),
      ],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedals-panel"]')).toBeNull();
    const rows = root.querySelectorAll('[data-testid="song-pedal-row"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute('data-song-pedal-id')).toBe('c-new');
    expect(rows[0]?.querySelector('[data-testid="song-pedal-label"]')?.textContent?.trim()).toBe('Lead');
    expect(rows[0]?.querySelector('[data-testid="song-pedal-name"]')?.textContent?.trim()).toBe('Lead boost');
    expect(root.querySelector('[data-testid="song-pedals-status"]')?.textContent).toContain('Pedal attached');
  });

  test('R6 d — empty state replaced by the new row after a 201', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, { songPedals: [], catalog: [catalogPedal({ id: 'p1' })] });
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-pedals-empty"]')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedals-empty"]')).toBeNull();
    expect(root.querySelectorAll('[data-testid="song-pedal-row"]').length).toBe(1);
  });

  test('R6 e — 201 does not re-fetch GET /songs/<id>/pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await settle(fixture);
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/s1/pedals`);
  });
});

// F36 R7 — attach error mapping.
describe('F36 R7 — attach error mapping', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function openAndPickValidDraft(httpMock: HttpTestingController, fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>): Promise<void> {
    await loadSection(fixture, httpMock, {
      catalog: [catalogPedal({ id: 'p1', name: 'A' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
  }

  test('R7 a — 400 label is required → field error', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush(
      { error: 'label is required' },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);
    const err = root.querySelector('[data-testid="song-pedals-label-error"]');
    expect(err?.textContent).toContain('Enter a label for this pedal.');
    expect((root.querySelector('[data-testid="song-pedals-attach"]') as HTMLButtonElement | null)?.disabled).toBe(false);
    // Draft is kept (label still has 'Lead').
    expect(root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!.value).toBe('Lead');
  });

  test('R7 b — 400 pedal_catalog_id gone → pedal_gone alert, selection cleared, one new GET /pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush(
      { error: 'pedal_catalog_id does not reference an existing pedal' },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle(fixture);
    const alert = root.querySelector('[data-testid="song-pedals-attach-alert"]');
    expect(alert?.textContent).toContain('removed from the catalog');
    // One new GET /pedals fires to refresh the catalog.
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([catalogPedal({ id: 'p1', name: 'A' })]);
    await settle(fixture);
    // Selection cleared; no radio is checked.
    const radio = root.querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]');
    expect(radio).not.toBeNull();
    expect(radio!.checked).toBe(false);
  });

  test('R7 c — 404 → song_not_found in panel alert', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush(
      { error: 'song not found' },
      { status: 404, statusText: 'Not Found' },
    );
    await settle(fixture);
    const alert = root.querySelector('[data-testid="song-pedals-attach-alert"]');
    expect(alert?.textContent).toContain('This song no longer exists');
  });

  test('R7 d — 401 → session_expired + /login link', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('unauth', { status: 401, statusText: 'Unauthorized' });
    await settle(fixture);
    const alert = root.querySelector('[data-testid="song-pedals-attach-alert"]');
    expect(alert?.textContent).toContain('Your session has expired.');
    const link = alert!.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/login');
  });

  test('R7 e — status 0 → unreachable in panel alert', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).error(new ProgressEvent('error'));
    await settle(fixture);
    const alert = root.querySelector('[data-testid="song-pedals-attach-alert"]');
    expect(alert?.textContent).toContain("Couldn't reach the server.");
  });

  test('R7 f — 500 / other 400 / non-HTTP → attach_failed', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    const alert = root.querySelector('[data-testid="song-pedals-attach-alert"]');
    expect(alert?.textContent).toContain("Couldn't attach the pedal.");
  });

  test('R7 g — editing the label or selection clears the panel alert', async () => {
    const { httpMock, fixture } = setup('s1');
    await openAndPickValidDraft(httpMock, fixture);
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedals-attach-alert"]')).not.toBeNull();
    const label = root.querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead 2';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedals-attach-alert"]')).toBeNull();
  });
});

// F36 R8 — detach confirmation.
describe('F36 R8 — detach confirmation', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R8 a — Detach shows the label, Confirm, Keep; no request', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    const confirmText = root.querySelector('[data-testid="song-pedal-confirm-text"]');
    expect(confirmText?.textContent).toContain('My Lead');
    expect(root.querySelector('[data-testid="song-pedal-keep"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="song-pedal-confirm-detach"]')).not.toBeNull();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/s1/pedals/c1`);
  });

  test('R8 b — Keep closes the confirmation, no request', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedal-keep"]')!.click();
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedal-confirm"]')).toBeNull();
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/s1/pedals/c1`);
  });

  test('R8 c — Escape on the confirmation closes it', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    const confirm = root.querySelector('[data-testid="song-pedal-confirm"]') as HTMLElement;
    confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(fixture);
    expect(root.querySelector('[data-testid="song-pedal-confirm"]')).toBeNull();
  });

  test('R8 d — second Detach replaces the first row\'s confirmation', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [
        songPedal({ id: 'c1', label: 'Lead' }),
        songPedal({ id: 'c2', label: 'Rhythm', pedalCatalogId: 'p2' }),
      ],
      catalog: [
        catalogPedal({ id: 'p1' }),
        catalogPedal({ id: 'p2' }),
      ],
    });
    const root = fixture.nativeElement as HTMLElement;
    const row1 = root.querySelector<HTMLElement>('[data-song-pedal-id="c1"]')!;
    row1.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    expect(root.querySelector('[data-song-pedal-id="c1"] [data-testid="song-pedal-confirm"]')).not.toBeNull();
    expect(root.querySelector('[data-song-pedal-id="c2"] [data-testid="song-pedal-confirm"]')).toBeNull();
    const row2 = root.querySelector<HTMLElement>('[data-song-pedal-id="c2"]')!;
    row2.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    expect(root.querySelector('[data-song-pedal-id="c1"] [data-testid="song-pedal-confirm"]')).toBeNull();
    expect(root.querySelector('[data-song-pedal-id="c2"] [data-testid="song-pedal-confirm"]')).not.toBeNull();
  });
  test('R8 e — while a detach is pending, other rows\' Detach is disabled and keeps the pending confirmation', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'Lead' }), songPedal({ id: 'c2', label: 'Rhythm' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('[data-song-pedal-id="c1"] [data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="song-pedal-confirm-detach"]')!.click();
    await settle(fixture);
    const other = root.querySelector<HTMLButtonElement>('[data-song-pedal-id="c2"] [data-testid="song-pedal-detach"]')!;
    expect(other.disabled).toBe(true);
    fixture.componentInstance.askDetach('c2');
    await settle(fixture);
    expect(root.querySelector('[data-song-pedal-id="c1"] [data-testid="song-pedal-confirm"]')).not.toBeNull();
    expect(root.querySelector('[data-song-pedal-id="c2"] [data-testid="song-pedal-confirm"]')).toBeNull();
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect(root.querySelector<HTMLButtonElement>('[data-song-pedal-id="c2"] [data-testid="song-pedal-detach"]')!.disabled).toBe(false);
  });
});

// F36 R9 — detach write.
describe('F36 R9 — detach write', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setupWithRowAndConfirm(fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>, httpMock: HttpTestingController): Promise<void> {
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-detach"]',
    )!.click();
    await settle(fixture);
  }

  test('R9 a — Confirm sends one DELETE to /songs/<id>/pedals/<entry id>', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    const delReq = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush(null, { status: 204, statusText: 'No Content' });
  });

  test('R9 b — pending detach: Confirm/Keep disabled, Confirm label = detaching', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    const confirm = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!;
    const keep = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-keep"]',
    )!;
    expect(confirm.textContent?.trim()).toBe('Detaching…');
    expect(confirm.disabled).toBe(true);
    expect(keep.disabled).toBe(true);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
  });

  test('R9 c — 204 removes the row, announces detached', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-pedal-row"]')).toBeNull();
    expect(root.querySelector('[data-testid="song-pedals-status"]')?.textContent).toContain('Pedal detached');
  });

  test('R9 d — 204 on the last row → empty state', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="song-pedals-empty"]')).not.toBeNull();
  });

  test('R9 e — 204: no re-fetch of GET /songs/<id>/pedals or GET /pedals', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    httpMock.expectNone(`${environment.apiBaseUrl}/songs/s1/pedals`);
    httpMock.expectNone(`${environment.apiBaseUrl}/pedals`);
  });
});

// F36 R10 — detach error mapping.
describe('F36 R10 — detach error mapping', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setupWithRowAndConfirm(fixture: ReturnType<typeof TestBed.createComponent<SongPedalsSection>>, httpMock: HttpTestingController): Promise<void> {
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-detach"]',
    )!.click();
    await settle(fixture);
  }

  test.each([
    { name: 'a: 404', status: 404, body: { error: 'song pedal config not found' }, expectedText: 'already detached', removes: true },
    { name: 'b: 401', status: 401, body: { error: 'unauthorized' }, expectedText: 'Your session has expired.', removes: false },
    { name: 'c: status 0', status: 0, body: null, expectedText: "Couldn't reach the server.", removes: false, statusText: 'Unknown Error' },
    { name: 'd: 500', status: 500, body: { error: 'boom' }, expectedText: "Couldn't detach the pedal.", removes: false },
  ])('R10 $name', async ({ status, body, expectedText, removes, statusText }) => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`);
    if (status === 0) {
      req.error(new ProgressEvent('error'));
    } else {
      req.flush(body, { status, statusText: statusText ?? 'Error' });
    }
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    const alert = root.querySelector('[data-testid="song-pedals-detach-alert"]');
    expect(alert?.textContent).toContain(expectedText);
    if (removes) {
      expect(root.querySelector('[data-testid="song-pedal-row"]')).toBeNull();
    } else {
      expect(root.querySelector('[data-testid="song-pedal-row"]')).not.toBeNull();
    }
  });

  test('R10 e — a later successful detach clears the previous error', async () => {
    const { httpMock, fixture } = setup('s1');
    await setupWithRowAndConfirm(fixture, httpMock);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="song-pedals-detach-alert"]')).not.toBeNull();
    // Now retry the detach.
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-detach"]',
    )!.click();
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="song-pedal-confirm-detach"]',
    )!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c1`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="song-pedals-detach-alert"]')).toBeNull();
  });
});

// F36 R11 — full flow audit: only the four contract endpoints fire.
describe('F36 R11 — full flow audit', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('R11 a — load → attach (201) → detach (204): only GET/GET/POST/DELETE fire', async () => {
    const { httpMock, fixture } = setup('s1');
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush([]);
    httpMock.expectOne(`${environment.apiBaseUrl}/pedals`).flush([catalogPedal({ id: 'p1' })]);
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="open-attach-panel"]')!.click();
    await settle(fixture);
    const radio = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('[data-testid="catalog-radio-p1"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const label = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('[data-testid="song-pedals-label"]')!;
    label.value = 'Lead';
    label.dispatchEvent(new Event('input'));
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="song-pedals-attach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals`).flush({
      id: 'c-new',
      songId: 's1',
      pedalCatalogId: 'p1',
      label: 'Lead',
      config: {},
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
    });
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!.click();
    await settle(fixture);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="song-pedal-confirm-detach"]')!.click();
    await settle(fixture);
    httpMock.expectOne(`${environment.apiBaseUrl}/songs/s1/pedals/c-new`).flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);
    httpMock.verify();

    const offenders = httpMock.match((req) => {
      const url = req.url;
      const method = req.method;
      if (url.includes('/pedals') && method !== 'GET') {
        if (method === 'POST' && url.endsWith('/songs/s1/pedals')) return false;
        if (method === 'DELETE' && /\/songs\/s1\/pedals\/[^/]+$/.test(url)) return false;
        return true;
      }
      return false;
    });
    expect(offenders).toEqual([]);
  });
});

// F36 R14 — visual direction / layout contract.
describe('F36 R14 — visual direction layout contract', () => {
  afterEach(() => TestBed.resetTestingModule());

  test('rows have min-w-0; label has truncate; Detach has shrink-0; status region has role=status', async () => {
    const { httpMock, fixture } = setup('s1');
    await loadSection(fixture, httpMock, {
      songPedals: [songPedal({ id: 'c1', label: 'My Lead' })],
      catalog: [catalogPedal({ id: 'p1' })],
    });
    const root = fixture.nativeElement as HTMLElement;
    const row = root.querySelector<HTMLElement>('[data-testid="song-pedal-row"]')!;
    expect(row.classList.contains('min-w-0')).toBe(true);
    const label = row.querySelector<HTMLElement>('[data-testid="song-pedal-label"]')!;
    expect(label.classList.contains('truncate')).toBe(true);
    const detach = row.querySelector<HTMLButtonElement>('[data-testid="song-pedal-detach"]')!;
    expect(detach.classList.contains('shrink-0')).toBe(true);
    const status = root.querySelector<HTMLElement>('[data-testid="song-pedals-status"]')!;
    expect(status.getAttribute('role')).toBe('status');
  });
});
