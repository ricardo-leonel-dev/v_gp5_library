import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { PresetBrowserPage } from './preset-browser-page';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { SelectedPresetStore } from '../selected-preset.service';
import { appConfig } from '../../app.config';
import type { PedalConnectionState } from '../../midi/pedal-connection';
import type { Preset } from '../../midi/preset';

const esTranslations = {
  auth: {
    login_title: 'Iniciar sesión',
    register_title: 'Crear cuenta',
    email: 'Correo',
    password: 'Contraseña',
    login_submit: 'Entrar',
    register_submit: 'Crear cuenta',
    no_account: '¿No tienes cuenta?',
    have_account: '¿Ya tienes cuenta?',
    register_link: 'Regístrate',
    login_link: 'Inicia sesión',
    login_error: 'Correo o contraseña incorrectos',
    register_error: 'No se pudo crear la cuenta',
  },
  songs: {
    title: 'Mis canciones',
    placeholder: 'Aquí vivirá tu librería de presets guardados.',
  },
  shared: {
    dark_mode: 'Oscuro',
    light_mode: 'Claro',
  },
  pedal: {
    title: 'Conexión del pedal',
    connect: 'Conectar al GP-5',
    state_not_connected: 'No conectado',
    state_connecting: 'Conectando...',
    state_connected: 'Conectado',
    state_error: 'Error de conexión',
    unsupported: 'Tu navegador no soporta la Web MIDI API. Por favor usa Chrome, Edge, Opera, Samsung Internet o Firefox 108+.',
    midi_access_denied: 'Se denegó el acceso MIDI. Por favor permite el acceso MIDI e inténtalo de nuevo.',
    gp5_not_found: 'No se detectó el pedal GP-5. Por favor conéctalo por USB e inténtalo de nuevo.',
    unknown: 'No se pudo conectar con el pedal.',
    view_presets: 'Ver presets',
  },
  presetBrowser: {
    title: 'Presets del pedal',
    not_connected: 'Conecta el pedal para ver sus presets.',
    loading: 'Cargando presets...',
    no_presets: 'No se encontraron presets.',
    empty_chain: '(cadena vacía)',
    select: 'Seleccionar',
    not_connected_error: 'El pedal no está conectado.',
    request_in_progress: 'Ya hay una operación MIDI en curso.',
    read_timeout: 'La lectura de presets ha expirado.',
    invalid_response: 'Respuesta MIDI no válida.',
    unknown: 'No se pudieron leer los presets.',
  },
};

type ReadPresetsResult = Promise<Preset[]>;

class FakePedal {
  private readonly state = signal<PedalConnectionState>('not-connected');
  readonly connectionState = this.state.asReadonly();

  isSupportedResult = true;
  // A controllable deferred promise; tests set then resolve/reject it.
  pending: { resolve: (presets: Preset[]) => void; reject: (error: Error) => void } | null = null;
  resolveWith: Preset[] | 'pending' | Error = [];

  isSupported(): boolean {
    return this.isSupportedResult;
  }

  setConnectionState(next: PedalConnectionState): void {
    this.state.set(next);
  }

  readPresets(): ReadPresetsResult {
    if (this.resolveWith === 'pending') {
      return new Promise<Preset[]>((resolve, reject) => {
        this.pending = { resolve, reject };
      });
    }
    if (this.resolveWith instanceof Error) {
      return Promise.reject(this.resolveWith);
    }
    return Promise.resolve(this.resolveWith);
  }
}

class FakeSelectedPresetStore {
  select = vi.fn();
}

function setup(
  fake: FakePedal,
  fakeStore: FakeSelectedPresetStore = new FakeSelectedPresetStore(),
): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [PresetBrowserPage],
    providers: [
      ...appConfig.providers,
      provideHttpClientTesting(),
      { provide: WebMidiPedalConnection, useValue: fake },
      { provide: SelectedPresetStore, useValue: fakeStore },
    ],
  });

  const httpMock = TestBed.inject(HttpTestingController);
  return httpMock;
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock
    .match((req) => req.url === '/i18n/es.json')
    .forEach((req) => req.flush(esTranslations));
  httpMock
    .match((req) => req.url === '/i18n/en.json')
    .forEach((req) => req.flush({}));
}

describe('PresetBrowserPage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the unsupported message and never calls readPresets() when isSupported() is false (R3)', () => {
    const fake = new FakePedal();
    fake.isSupportedResult = false;
    // If unsupported branch were ever taken by mistake, this would resolve — guard it.
    fake.resolveWith = 'pending';
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PresetBrowserPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="unsupported-message"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="not-connected-message"]')).toBeNull();
    expect(fake.pending).toBeNull();
  });

  it('renders the not-connected message and never calls readPresets() when supported but not connected (R4)', () => {
    const fake = new FakePedal();
    fake.resolveWith = 'pending';
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PresetBrowserPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="not-connected-message"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="unsupported-message"]')).toBeNull();
    expect(fake.pending).toBeNull();
  });

  it('calls readPresets() exactly once when supported and connected (R5)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    const readSpy = vi.spyOn(fake, 'readPresets');
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PresetBrowserPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    await Promise.resolve();

    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the loading indicator while readPresets() is pending (R6)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = 'pending';
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PresetBrowserPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="loading"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="preset-error"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="no-presets"]')).toBeNull();
  });

  it('renders one row per element of the resolved array, in array order, showing slot and name (R7, R8)', async () => {
    const fixture: Preset[] = [
      { slot: 5, name: 'Crunch', chain: [] },
      { slot: 1, name: 'Clean', chain: [] },
      { slot: 3, name: 'Lead', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const rows = (component.nativeElement as HTMLElement).querySelectorAll('[data-testid^="preset-row-"]');
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('data-testid')).toBe('preset-row-5');
    expect(rows[1].getAttribute('data-testid')).toBe('preset-row-1');
    expect(rows[2].getAttribute('data-testid')).toBe('preset-row-3');
    expect(rows[0].textContent).toContain('Crunch');
    expect(rows[1].textContent).toContain('Clean');
    expect(rows[2].textContent).toContain('Lead');
  });

  it('renders only enabled moduleTypes, comma-separated, in chain order (R9)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'Mixed',
        chain: [
          { moduleType: 'comp', enabled: true, parameters: {} },
          { moduleType: 'drive', enabled: false, parameters: {} },
          { moduleType: 'amp', enabled: true, parameters: {} },
          { moduleType: 'cab', enabled: true, parameters: {} },
        ],
      },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const chain = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="preset-chain-1"]',
    ) as HTMLElement | null;
    expect(chain).not.toBeNull();
    expect(chain?.textContent?.trim()).toBe('comp, amp, cab');
  });

  it('renders the empty-chain placeholder when no chain entry is enabled (R10)', async () => {
    const fixture: Preset[] = [
      {
        slot: 2,
        name: 'Empty',
        chain: [
          { moduleType: 'comp', enabled: false, parameters: {} },
          { moduleType: 'amp', enabled: false, parameters: {} },
        ],
      },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const chain = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="preset-chain-2"]',
    ) as HTMLElement | null;
    expect(chain?.textContent?.trim()).toBe('(cadena vacía)');
  });

  it('renders the mapped error message and no preset rows when readPresets() rejects with a known key (R11)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = new Error('read_timeout');
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    // Two awaits: one to flip the rejected promise into an unhandled-r rejection
    // and another to flush the .catch handler in loadPresets().
    await Promise.resolve();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    const error = compiled.querySelector('[data-testid="preset-error"]');
    expect(error).not.toBeNull();
    expect(error?.className).toContain('text-red-600');
    expect(error?.textContent).toContain('La lectura de presets ha expirado');
    expect(compiled.querySelectorAll('[data-testid^="preset-row-"]')).toHaveLength(0);
  });

  it('renders the no-presets message and no preset rows when readPresets() resolves with [] (R12)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = [];
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="no-presets"]')).not.toBeNull();
    expect(compiled.querySelectorAll('[data-testid^="preset-row-"]')).toHaveLength(0);
  });

  it('calls SelectedPresetStore.select(preset) when the row select button is clicked (R15)', async () => {
    const fixture: Preset[] = [
      { slot: 7, name: 'Test', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeStore = new FakeSelectedPresetStore();
    const httpMock = setup(fake, fakeStore);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const button = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-7"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();

    expect(fakeStore.select).toHaveBeenCalledTimes(1);
    expect(fakeStore.select).toHaveBeenCalledWith(fixture[0]);
  });
});
