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
  chainBoard: {
    title: 'Cadena de señal',
    close: 'Cerrar',
    browse: 'Ver todos los efectos de {{category}}',
    active: 'En este preset',
    state_on: 'Activo',
    state_off: 'Bypass',
    unknown: 'No reconocido',
    unknown_short: '?',
    unknown_module: 'No se pudo identificar este módulo. Abajo están sus valores sin procesar.',
    mapping_hypothesis: 'Hipótesis de mapeo de parámetros.',
    manual_page: 'Manual p. {{page}}',
    parameters: 'Parámetros',
    block_aria: '{{category}}: {{fx}}, {{state}}',
    no_parameters: 'Este bloque no tiene parámetros guardados.',
    categories: {
      c0: 'Reducción de ruido',
      c1: 'Pre-efectos',
      c2: 'Distorsión',
      c3: 'SnapTone',
      c4: 'Amplificador',
      c5: 'Gabinete',
      c6: 'Ecualizador',
      c7: 'Modulación',
      c8: 'Delay',
      c9: 'Reverb',
    },
  },
  gp5Fx: {
    c0: { f0: 'Compuerta' },
    c1: { f0: 'Compresor clásico' },
    c4: { f0: 'Amplificador tweed clásico' },
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

  async writePreset(_preset: Preset): Promise<void> {
    throw new Error('writePreset should not be called from the preset browser page');
  }
}

class FakeSelectedPresetStore {
  private readonly signal = signal<Preset | null>(null);
  readonly selectedPreset = this.signal.asReadonly();
  select = vi.fn((preset: Preset): void => {
    this.signal.set(preset);
  });
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

  it('renders one strip block per chain entry on the row (R15, R33)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'Mixed',
        chain: [
          { moduleType: 'cat1_fx0', enabled: true, parameters: {} },
          { moduleType: 'cat4_fx0', enabled: false, parameters: {} },
          { moduleType: 'cat8_fx0', enabled: true, parameters: {} },
          { moduleType: 'cat5_fx0', enabled: true, parameters: {} },
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

    const row = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="preset-row-1"]',
    ) as HTMLElement;
    const stripBlocks = row.querySelectorAll('[data-testid^="strip-block-"]');
    expect(stripBlocks).toHaveLength(4);
    expect(stripBlocks[0].getAttribute('data-testid')).toBe('strip-block-0');
    expect(stripBlocks[3].getAttribute('data-testid')).toBe('strip-block-3');
  });

  it('renders the empty-chain placeholder when the chain array is empty (R21)', async () => {
    const fixture: Preset[] = [
      {
        slot: 2,
        name: 'Empty',
        chain: [],
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

    const chainCell = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="preset-chain-2"]',
    ) as HTMLElement | null;
    expect(chainCell?.textContent?.trim()).toBe('(cadena vacía)');
  });

  it('does not render any cat*/fx* text after selecting a preset and opening every block (R20)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'Mixed',
        chain: [
          { moduleType: 'cat1_fx0', enabled: true, parameters: { p0: 1, p1: 2 } },
          { moduleType: 'empty', enabled: false, parameters: { p0: 1 } },
          { moduleType: 'cat99_fx0', enabled: true, parameters: { p0: 1 } },
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

    // Select the preset
    const selectBtn = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-1"]',
    ) as HTMLButtonElement;
    selectBtn.click();
    component.detectChanges();

    // Open each block in turn and verify the page text never matches the
    // raw codec pattern.
    const board = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="chain-board"]',
    ) as HTMLElement;
    const blocks = board.querySelectorAll('[data-testid^="board-block-"]');
    for (const block of Array.from(blocks)) {
      (block as HTMLButtonElement).click();
      component.detectChanges();
    }

    const rawPattern = /cat[0-9a-f]+_fx[0-9a-f]+/i;
    const all = (component.nativeElement as HTMLElement).textContent ?? '';
    expect(all).not.toMatch(rawPattern);

    // The 'empty' entry's strip block shows ? (unknown_short) not the word
    // "empty".
    const stripBlocks = (component.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect(stripBlocks[1].textContent?.trim()).toBe('?');
  });

  it('does not render a chain board before a preset is selected (R23)', async () => {
    const fixture: Preset[] = [
      { slot: 1, name: 'A', chain: [{ moduleType: 'cat1_fx0', enabled: true, parameters: {} }] },
      { slot: 2, name: 'B', chain: [{ moduleType: 'cat1_fx0', enabled: true, parameters: {} }] },
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

    expect((component.nativeElement as HTMLElement).querySelector('[data-testid="board-section"]')).toBeNull();
  });

  it('renders the board with the selected preset\'s blocks after clicking Select (R22)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'Alpha',
        chain: [
          { moduleType: 'cat1_fx0', enabled: true, parameters: {} },
          { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
        ],
      },
      {
        slot: 2,
        name: 'Beta',
        chain: [{ moduleType: 'cat8_fx0', enabled: true, parameters: {} }],
      },
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

    // Click Select on slot 2 (Beta, one block).
    const selectBtn = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-2"]',
    ) as HTMLButtonElement;
    selectBtn.click();
    component.detectChanges();

    const board = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="chain-board"]',
    ) as HTMLElement;
    expect(board).not.toBeNull();
    const boardBlocks = board.querySelectorAll('[data-testid^="board-block-"]');
    expect(boardBlocks).toHaveLength(1);
    expect(boardBlocks[0].getAttribute('data-testid')).toBe('board-block-0');
  });

  it('clicking a board block opens the detail panel; selecting another preset closes it (R24, R25)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'A',
        chain: [
          { moduleType: 'cat1_fx0', enabled: true, parameters: { p0: 1, p1: 2 } },
          { moduleType: 'cat4_fx0', enabled: true, parameters: { p0: 5, p1: 6, p2: 7 } },
        ],
      },
      {
        slot: 2,
        name: 'B',
        chain: [{ moduleType: 'cat8_fx0', enabled: true, parameters: { p0: 10, p1: 20, p2: 30, p3: 40 } }],
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

    // Select A.
    (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-1"]',
    )?.dispatchEvent(new Event('click'));
    component.detectChanges();

    // Open block 1 of A.
    const boardA = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="chain-board"]',
    ) as HTMLElement;
    (boardA.querySelector('[data-testid="board-block-1"]') as HTMLButtonElement).click();
    component.detectChanges();
    expect((component.nativeElement as HTMLElement).querySelector('[data-testid="block-detail"]')).not.toBeNull();

    // Select B — detail panel should close (R25).
    (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-2"]',
    )?.dispatchEvent(new Event('click'));
    component.detectChanges();
    expect((component.nativeElement as HTMLElement).querySelector('[data-testid="block-detail"]')).toBeNull();
  });

  it('does not call writePreset and calls readPresets exactly once across all interactions (R36, R37)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'A',
        chain: [
          { moduleType: 'cat1_fx0', enabled: true, parameters: { p0: 1, p1: 2 } },
          { moduleType: 'cat4_fx0', enabled: true, parameters: { p0: 5, p1: 6, p2: 7 } },
          { moduleType: 'cat8_fx0', enabled: true, parameters: { p0: 10, p1: 20, p2: 30, p3: 40 } },
        ],
      },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const readSpy = vi.spyOn(fake, 'readPresets');
    const writeSpy = vi.spyOn(fake, 'writePreset');
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    // Select the preset.
    (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-preset-1"]',
    )?.dispatchEvent(new Event('click'));
    component.detectChanges();

    const board = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="chain-board"]',
    ) as HTMLElement;
    // Click every board block.
    for (const block of Array.from(board.querySelectorAll('[data-testid^="board-block-"]'))) {
      (block as HTMLButtonElement).click();
      component.detectChanges();
    }

    // Toggle the FX browser open and closed.
    const browseToggle = (component.nativeElement as HTMLElement).querySelector(
      '[data-testid="browse-toggle"]',
    ) as HTMLButtonElement;
    browseToggle.click();
    component.detectChanges();
    browseToggle.click();
    component.detectChanges();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalledTimes(1);
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

  it('renders the not-connected-error message when readPresets() rejects with "not_connected" (R11)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = new Error('not_connected');
    const httpMock = setup(fake);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    const error = compiled.querySelector('[data-testid="preset-error"]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('El pedal no está conectado.');
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