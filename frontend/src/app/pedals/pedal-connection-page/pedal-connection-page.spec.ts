import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { PedalConnectionPage } from './pedal-connection-page';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import type { PedalConnectionState } from '../../midi/pedal-connection';
import { appConfig } from '../../app.config';

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
  unsupportedBrowser: {
    title: 'Este navegador no puede conectarse al GP-5.',
    body: 'Conectar el pedal y leer o escribir sus presets requiere Web MIDI.',
    browsers: 'Abre la app en Chrome, Edge, Opera, Samsung Internet o Firefox 108+.',
    footnote: 'Tus canciones guardadas siguen disponibles en este navegador.',
    insecure_body: 'Esta página se abrió sin conexión segura (http://).',
    insecure_compact: 'Ábrela desde una dirección https:// o desde localhost.',
  },
};

class FakePedal {
  private readonly state = signal<PedalConnectionState>('not-connected');
  readonly connectionState = this.state.asReadonly();

  isSupportedResult = true;
  connectError: string | null = null;

  isSupported(): boolean {
    return this.isSupportedResult;
  }

  async connect(): Promise<void> {
    this.state.set('connecting');
    if (this.connectError !== null) {
      this.state.set('error');
      throw new Error(this.connectError);
    }
    this.state.set('connected');
  }
}

function setup(fake: FakePedal): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [PedalConnectionPage],
    providers: [
      ...appConfig.providers,
      provideHttpClientTesting(),
      { provide: WebMidiPedalConnection, useValue: fake },
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

describe('PedalConnectionPage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('F9 R11, R12 — unsupported: <h1> + shared message, no connect/state/presets/error controls', () => {
    const fake = new FakePedal();
    fake.isSupportedResult = false;
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Conexión del pedal');
    const message = compiled.querySelector('[data-testid="unsupported-browser-message"]');
    expect(message).not.toBeNull();
    expect(message?.getAttribute('data-variant')).toBe('full');
    expect(message?.querySelector('h2')?.textContent).toContain('Este navegador no puede conectarse al GP-5.');
    expect(compiled.querySelector('[data-testid="connect-button"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="connection-state"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="presets-link"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="connection-error"]')).toBeNull();
    expect(compiled.textContent).not.toContain('Tu navegador no soporta la Web MIDI API');
  });

  it('F9 R13 — supported but MIDI access denied: connection-error, no unsupported message', async () => {
    const fake = new FakePedal();
    fake.connectError = 'midi_access_denied';
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="connect-button"]') as HTMLButtonElement;
    button.click();
    await fixture.componentInstance.connect();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="connection-error"]')?.textContent).toContain('Se denegó el acceso MIDI');
    expect(compiled.querySelector('[data-testid="unsupported-browser-message"]')).toBeNull();
  });

  it('renders the connect control and the translated state label when Web MIDI is supported (R11)', () => {
    const fake = new FakePedal();
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="connect-button"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="connection-state"]')?.textContent).toContain('No conectado');
    expect(compiled.querySelector('[data-testid="unsupported-browser-message"]')).toBeNull();
  });

  it('calls connect() when the button is clicked and reflects the connected state (R11, R6)', async () => {
    const fake = new FakePedal();
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="connect-button"]') as HTMLButtonElement;
    button.click();
    await fixture.componentInstance.connect();
    fixture.detectChanges();

    expect(fake.connectionState()).toBe('connected');
    const state = fixture.nativeElement.querySelector('[data-testid="connection-state"]') as HTMLElement;
    expect(state.textContent).toContain('Conectado');
    expect(fixture.nativeElement.querySelector('[data-testid="connection-error"]')).toBeNull();
  });

  it('renders the mapped error key in red when connect() rejects with a known message (R11 + R7)', async () => {
    const fake = new FakePedal();
    fake.connectError = 'gp5_not_found';
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="connect-button"]') as HTMLButtonElement;
    button.click();
    await fixture.componentInstance.connect();
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('[data-testid="connection-error"]') as HTMLElement | null;
    expect(error).not.toBeNull();
    expect(error?.className).toContain('text-red-600');
    expect(error?.textContent).toContain('No se detectó el pedal GP-5');
  });

  it('does not render the presets link while not connected (R14)', () => {
    const fake = new FakePedal();
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="presets-link"]')).toBeNull();
  });

  it('renders the presets link pointing at /pedal/presets once connected (R14)', async () => {
    const fake = new FakePedal();
    const httpMock = setup(fake);

    const fixture = TestBed.createComponent(PedalConnectionPage);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="connect-button"]') as HTMLButtonElement;
    button.click();
    await fixture.componentInstance.connect();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('[data-testid="presets-link"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/pedal/presets');
    expect(link?.textContent).toContain('Ver presets');
  });
});
