import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { App } from './app';
import { appConfig } from './app.config';
import { AuthStore } from './auth/auth-store.service';
import { PedalConnectFlow } from './pedals/pedal-connect-flow.service';
import { MockPresetsStore } from './pedals/mock-presets.store';
import { vi } from 'vitest';
import { provideTransloco, type TranslocoLoader } from '@jsverse/transloco';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import type { Translation } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({
      songs: { title: 'My songs' },
      pedalButton: { dismiss_error: 'Dismiss' },
      presetBrowser: { load_test_presets: 'Load test presets' },
      pedal: {
        unknown: 'Unknown error',
        midi_access_denied: 'MIDI access denied',
      },
    } as Translation);
  }
}

function setup(opts: { isAuthenticated?: boolean; flowError?: string | null } = {}): {
  httpMock: HttpTestingController;
  auth: { isAuthenticated: ReturnType<typeof signal<boolean>> };
  flow: {
    start: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof signal<string | null>>;
    dismissError: ReturnType<typeof vi.fn>;
  };
  mocks: { load: ReturnType<typeof vi.fn> };
  router: { url: string; navigateByUrl: ReturnType<typeof vi.fn> };
  fixture: ReturnType<typeof TestBed.createComponent<App>>;
} {
  const authSig = signal(opts.isAuthenticated ?? false);
  const flowErr = signal<string | null>(opts.flowError ?? null);
  const routerStub = { url: '/songs', navigateByUrl: vi.fn().mockResolvedValue(true) };
  const flow = {
    supported: true,
    connectionState: signal('not-connected'),
    reading: signal(false),
    error: flowErr,
    start: vi.fn().mockResolvedValue(undefined),
    dismissError: vi.fn(),
  };
  const mocks = { load: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      provideHttpClientTesting(),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
      { provide: AuthStore, useValue: { isAuthenticated: authSig } },
      { provide: PedalConnectFlow, useValue: flow },
      { provide: MockPresetsStore, useValue: mocks },
      { provide: Router, useValue: routerStub },
    ],
  });
  return {
    httpMock: TestBed.inject(HttpTestingController),
    auth: { isAuthenticated: authSig },
    flow: flow as { start: ReturnType<typeof vi.fn>; error: ReturnType<typeof signal<string | null>>; dismissError: ReturnType<typeof vi.fn> },
    mocks: mocks as { load: ReturnType<typeof vi.fn> },
    router: routerStub as { url: string; navigateByUrl: ReturnType<typeof vi.fn> },
    fixture: TestBed.createComponent(App),
  };
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock.match(() => true).forEach((req) => req.flush({}));
}

describe('App', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create the app shell', () => {
    const { fixture } = setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the language switcher and dark mode toggle', () => {
    const { fixture, httpMock } = setup();
    fixture.detectChanges();
    flushI18n(httpMock);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-language-switcher')).toBeTruthy();
    expect(compiled.querySelector('app-dark-mode-toggle')).toBeTruthy();
  });

  it('R44, R45 — unauthenticated: no nav-songs, no pedal-connect button', () => {
    const { fixture, httpMock } = setup({ isAuthenticated: false });
    fixture.detectChanges();
    flushI18n(httpMock);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="nav-songs"]')).toBeNull();
    expect(root.querySelector('[data-testid="pedal-connect"]')).toBeNull();
  });

  it('R43, R44 — authenticated: nav-songs and pedal-connect button present', () => {
    // RouterLink needs a real router to render href. Override the stub
    // Router with the real Router instance (provideRouter([]) is already
    // configured in `setup`).
    const authSig = signal(true);
    const flowErr = signal<string | null>(null);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClientTesting(),
        provideTransloco({
          config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
          loader: StubTranslocoLoader,
        }),
        { provide: AuthStore, useValue: { isAuthenticated: authSig } },
        {
          provide: PedalConnectFlow,
          useValue: {
            supported: true,
            connectionState: signal('not-connected'),
            reading: signal(false),
            error: flowErr,
            start: vi.fn(),
            dismissError: vi.fn(),
          },
        },
        { provide: MockPresetsStore, useValue: { load: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const nav = root.querySelector('a[data-testid="nav-songs"]');
    expect(nav).not.toBeNull();
    // RouterLink renders the href via the router. In a TestBed without
    // an active navigation, the href is unset but the directive sets
    // `routerLink` and the anchor wraps the song title.
    expect(nav?.textContent?.trim()).toBe('My songs');
    expect(root.querySelector('[data-testid="pedal-connect"]')).not.toBeNull();
  });

  it('R53 — flow error renders pedal-connect-error with role=alert and translated text', () => {
    const { fixture, httpMock } = setup({ isAuthenticated: true, flowError: 'midi_access_denied' });
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const err = root.querySelector('[data-testid="pedal-connect-error"]')!;
    expect(err).not.toBeNull();
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toContain('MIDI access denied');
  });

  it('R54 — dismiss button calls flow.dismissError()', () => {
    const { fixture, httpMock, flow } = setup({ isAuthenticated: true, flowError: 'unknown' });
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const dismiss = root.querySelector<HTMLButtonElement>('[data-testid="pedal-connect-error-dismiss"]')!;
    dismiss.click();
    expect(flow.dismissError).toHaveBeenCalledTimes(1);
  });

  it('R58 — mock link on /songs → mocks loaded and URL becomes /pedal/presets', () => {
    const { fixture, httpMock, mocks, router } = setup({ isAuthenticated: true });
    router.url = '/songs';
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const link: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-testid="load-mock-presets"]');
    link!.click();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/pedal/presets');
  });

  it('R58 — mock link on /pedal/presets → mocks loaded, no navigation call', () => {
    const { fixture, httpMock, mocks, router } = setup({ isAuthenticated: true });
    router.url = '/pedal/presets';
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const link: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-testid="load-mock-presets"]');
    link!.click();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});