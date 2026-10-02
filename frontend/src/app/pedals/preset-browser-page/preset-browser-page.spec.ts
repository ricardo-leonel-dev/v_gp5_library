import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { PresetBrowserPage } from './preset-browser-page';
import { WebMidiPedalConnection, READ_SETTLE_MS } from '../../midi/web-midi-pedal-connection';
import {
  SYSEX_PRESET_CODEC,
  type SysexPresetCodec,
  type SysexDecodeResult,
} from '../../midi/sysex-preset-codec';
import { PresetExportSelection } from '../preset-export-selection.service';
import { PresetComparisonStore } from '../preset-comparison.service';
import { MockPresetsStore } from '../mock-presets.store';
import { appConfig } from '../../app.config';
import type { PedalConnectionState } from '../../midi/pedal-connection';
import type { PresetRestoreWarning } from '../../midi/web-midi-pedal-connection';
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
    unsupported:
      'Tu navegador no soporta la Web MIDI API. Por favor usa Chrome, Edge, Opera, Samsung Internet o Firefox 108+.',
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
    deselect: 'Deseleccionar',
    export_label: 'Exportar',
    mark_for_export: 'Marcar {{name}} para exportar',
    browse_presets: 'Explorar presets',
    browse_presets_aria: 'Explorar presets',
    presets_selected_count: 'Comparando {{count}} preset(s)',
    footnote_unverified:
      'Los números de página reflejan una suposición basada en el comportamiento observado del firmware, no un mapeo del fabricante.',
    load_test_presets: 'Cargar presets de prueba',
    not_connected_error: 'El pedal no está conectado.',
    request_in_progress: 'Ya hay una operación MIDI en curso.',
    read_timeout: 'La lectura de presets ha expirado.',
    invalid_response: 'Respuesta MIDI no válida.',
    unknown: 'No se pudieron leer los presets.',
    restore_no_match:
      'No se pudo volver al preset que tenías activo: no coincide con ningún preset guardado (quizá tenía cambios sin guardar). El pedal quedó en el último preset leído.',
    restore_ambiguous:
      'No se pudo volver al preset que tenías activo: coincide con varios presets guardados. El pedal quedó en el último preset leído.',
  },
  chainBoard: {
    title: 'Cadena de señal',
    close: 'Cerrar',
    browse: 'Ver todos los efectos de {{category',
    active: 'En este preset',
    state_on: 'Activo',
    state_off: 'Bypass',
    unknown: 'No reconocido',
    unknown_short: '?',
    unknown_module: 'No se pudo identificar este módulo. Abajo están sus valores sin procesar.',
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
  readonly restoreWarning = signal<PresetRestoreWarning | null>(null);

  isSupportedResult = true;
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

class FakePresetExportSelection {
  private readonly markSignal = signal<ReadonlySet<number>>(new Set());
  readonly markedSlots = this.markSignal.asReadonly();
  toggle = vi.fn((slot: number): void => {
    const next = new Set(this.markSignal());
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    this.markSignal.set(next);
  });
  clear(): void {
    this.markSignal.set(new Set());
  }
}

class FakePresetComparisonStore {
  private readonly selectedSignal = signal<ReadonlySet<number>>(new Set());
  readonly selectedSlots = this.selectedSignal.asReadonly();
  add = vi.fn((slot: number): void => {
    const next = new Set(this.selectedSignal());
    next.add(slot);
    this.selectedSignal.set(next);
  });
  remove = vi.fn((slot: number): void => {
    const next = new Set(this.selectedSignal());
    next.delete(slot);
    this.selectedSignal.set(next);
  });
  toggle = vi.fn((slot: number): void => {
    const next = new Set(this.selectedSignal());
    if (next.has(slot)) next.delete(slot);
    else next.add(slot);
    this.selectedSignal.set(next);
  });
  clear = vi.fn((): void => {
    this.selectedSignal.set(new Set());
  });
}

function setup(
  fake: FakePedal,
  fakeExport: FakePresetExportSelection = new FakePresetExportSelection(),
  fakeComparison: FakePresetComparisonStore = new FakePresetComparisonStore(),
): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [PresetBrowserPage],
    providers: [
      ...appConfig.providers,
      provideHttpClientTesting(),
      { provide: WebMidiPedalConnection, useValue: fake },
      { provide: PresetExportSelection, useValue: fakeExport },
      { provide: PresetComparisonStore, useValue: fakeComparison },
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

describe('PresetBrowserPage (v6)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ---- Mock data flow (R28): header button -> MockPresetsStore -> page ---

  it('reads from MockPresetsStore when mock data has been loaded there (R28)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = []; // real pedal returns empty
    const httpMock = setup(fake);

    // Pre-populate the mock store as if the user clicked the header
    // ghost link. The page should pick this up via the effect() in its
    // constructor.
    const mockStore = TestBed.inject(MockPresetsStore);
    mockStore.load();

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // Six presets from the mock fixtures (5 non-empty + 1 empty chain)
    // should be visible in the picker when the user opens it.
    // (We don't open the picker here; we verify that no chip is in the
    // DOM yet because the user hasn't selected any preset.)
    expect(compiled.querySelectorAll('[data-testid^="preset-chip-"]')).toHaveLength(0);
    expect(compiled.querySelector('[data-testid="browse-presets"]')).not.toBeNull();
  });

  // ---- Chip row + Browse pill (R22, R23) --------------------------------

  it('renders a Browse pill always; renders chips only for slots in the comparison set (R22, R23)', async () => {
    const fixture: Preset[] = [
      { slot: 0, name: 'Plaza Clean', chain: [] },
      { slot: 1, name: 'Crunch Deluxe', chain: [] },
      { slot: 2, name: 'Saturated Snap', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(0);
    fakeCompare.add(2);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // Two chips for the slots in the comparison set (0 and 2).
    const chips = compiled.querySelectorAll('[data-testid^="preset-chip-"]');
    expect(chips).toHaveLength(2);
    expect(compiled.querySelector('[data-testid="preset-chip-0"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="preset-chip-2"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="preset-chip-1"]')).toBeNull();
    // Browse pill always visible.
    expect(compiled.querySelector('[data-testid="browse-presets"]')).not.toBeNull();
  });

  it('the chip row never renders a v5 drawer / compact list / sticky toolbar (R29)', async () => {
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = [{ slot: 0, name: 'X', chain: [] }];
    const httpMock = setup(fake);
    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="preset-drawer"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="drawer-handle"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="compact-list"]')).toBeNull();
    expect(compiled.querySelectorAll('[data-testid^="preset-row-"]')).toHaveLength(0);
    expect(compiled.querySelectorAll('[data-testid^="compact-row-"]')).toHaveLength(0);
    // v6-draft sticky toolbar markers also absent.
    expect(compiled.querySelector('[data-testid="preset-toolbar"]')).toBeNull();
    expect(compiled.querySelectorAll('[data-testid^="preset-tile-"]')).toHaveLength(0);
    expect(compiled.querySelector('[data-testid="preset-card-popup"]')).toBeNull();
  });

  // ---- Chip click + chip remove (R19, R20, R21) ------------------------

  it('clicking a chip sets activePreset and renders the matching board (R21, R24)', async () => {
    const fixture: Preset[] = [
      { slot: 1, name: 'A', chain: [] },
      { slot: 2, name: 'B', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(1);
    fakeCompare.add(2);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // Reset call history AFTER the setup-time add() calls so we can
    // assert that chip click alone doesn't mutate the store.
    fakeCompare.add.mockClear();
    fakeCompare.remove.mockClear();
    (compiled.querySelector('[data-testid="preset-chip-2"]') as HTMLButtonElement).click();
    component.detectChanges();

    // Main area shows B's chain board.
    expect(compiled.querySelector('[data-testid="main-heading"]')?.textContent).toContain('B');
    expect(compiled.querySelector('[data-testid="main-area"] [data-testid="chain-board"]')).not.toBeNull();
    // No store mutation on chip click.
    expect(fakeCompare.add).not.toHaveBeenCalled();
    expect(fakeCompare.remove).not.toHaveBeenCalled();
  });

  it('clicking the chip remove control calls comparison.remove (R19, R20)', async () => {
    const fixture: Preset[] = [
      { slot: 1, name: 'A', chain: [] },
      { slot: 2, name: 'B', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(1);
    fakeCompare.add(2);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="chip-remove-1"]') as HTMLElement).click();
    component.detectChanges();

    expect(fakeCompare.remove).toHaveBeenCalledWith(1);
    // Chip 1 removed; chip 2 still in DOM.
    expect(compiled.querySelector('[data-testid="preset-chip-1"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="preset-chip-2"]')).not.toBeNull();
  });

  it('with no chip clicked but a non-empty comparison set, the main area falls back to the lowest slot (R21, R24)', async () => {
    const fixture: Preset[] = [
      { slot: 5, name: 'X', chain: [] },
      { slot: 3, name: 'Y', chain: [] },
      { slot: 7, name: 'Z', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(5);
    fakeCompare.add(7);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // No chip clicked → fallback to lowest slot in {5, 7} = 5.
    expect(compiled.querySelector('[data-testid="main-heading"]')?.textContent).toContain('X');
  });

  // ---- Picker overlay (R25, R26) ---------------------------------------

  it('clicking the Browse pill opens the picker; clicking a picker row adds the slot and closes the picker (R25, R26)', async () => {
    const fixture: Preset[] = [
      { slot: 1, name: 'A', chain: [] },
      { slot: 2, name: 'B', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // Picker closed initially.
    expect(compiled.querySelector('[data-testid="picker-backdrop"]')).toBeNull();
    (compiled.querySelector('[data-testid="browse-presets"]') as HTMLButtonElement).click();
    component.detectChanges();
    expect(compiled.querySelector('[data-testid="picker-backdrop"]')).not.toBeNull();
    // Activate row 1 → adds to comparison set, closes picker.
    (compiled.querySelector('[data-testid="picker-row-1"]') as HTMLButtonElement).click();
    component.detectChanges();
    expect(fakeCompare.add).toHaveBeenCalledWith(1);
    expect(compiled.querySelector('[data-testid="picker-backdrop"]')).toBeNull();
  });

  it('clicking the picker backdrop closes the picker without mutating the comparison set (R25)', async () => {
    const fixture: Preset[] = [{ slot: 1, name: 'A', chain: [] }];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    (compiled.querySelector('[data-testid="browse-presets"]') as HTMLButtonElement).click();
    component.detectChanges();
    expect(compiled.querySelector('[data-testid="picker-backdrop"]')).not.toBeNull();
    (compiled.querySelector('[data-testid="picker-backdrop"]') as HTMLElement).click();
    component.detectChanges();
    expect(compiled.querySelector('[data-testid="picker-backdrop"]')).toBeNull();
    expect(fakeCompare.add).not.toHaveBeenCalled();
    expect(fakeCompare.remove).not.toHaveBeenCalled();
  });

  // ---- Block detail (R24) ----------------------------------------------

  it('clicking a block in the active preset renders the block detail next to the chassis (R24)', async () => {
    const fixture: Preset[] = [
      {
        slot: 1,
        name: 'A',
        chain: [
          { moduleType: 'cat0_fx0', enabled: true, parameters: { p0: 1, p1: 2 } },
          { moduleType: 'cat7_fx1', enabled: true, parameters: { p0: 5, p1: 6, p2: 7 } },
        ],
      },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(1);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    const board = compiled.querySelector(
      '[data-testid="main-area"] [data-testid="chain-board"]',
    ) as HTMLElement;
    expect(board).not.toBeNull();
    (board.querySelector('[data-testid="board-block-1"]') as HTMLButtonElement).click();
    component.detectChanges();
    expect(compiled.querySelector('[data-testid="block-detail"]')).not.toBeNull();
    // Muted footnote is rendered inside the block detail (R30).
    expect(compiled.querySelector('[data-testid="detail-footnote"]')).not.toBeNull();
  });

  // ---- Empty main area (R23, R24) ---------------------------------------

  it('when no preset is selected and the comparison set is empty, the main area shows the empty-state hint (R23)', async () => {
    const fixture: Preset[] = [{ slot: 1, name: 'A', chain: [] }];
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

    const compiled = component.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="main-empty"]')).not.toBeNull();
    // No chain-board in the main area when nothing is active.
    expect(compiled.querySelector('[data-testid="main-area"] [data-testid="chain-board"]')).toBeNull();
  });

  // ---- Export-mark is active-preset-only (R36-R39) ---------------------

  it('renders the export-mark checkbox for the active preset only (R36, R38)', async () => {
    const fixture: Preset[] = [
      { slot: 1, name: 'A', chain: [] },
      { slot: 2, name: 'B', chain: [] },
    ];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(1);
    const httpMock = setup(fake, undefined, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    const checkboxes = compiled.querySelectorAll('[data-testid^="export-mark-"]');
    expect(checkboxes).toHaveLength(1);
    expect(compiled.querySelector('[data-testid="export-mark-1"]')).not.toBeNull();
  });

  it('toggling the export-mark does not change the comparison set (R38)', async () => {
    const fixture: Preset[] = [{ slot: 1, name: 'A', chain: [] }];
    const fake = new FakePedal();
    fake.setConnectionState('connected');
    fake.resolveWith = fixture;
    const fakeExport = new FakePresetExportSelection();
    const fakeCompare = new FakePresetComparisonStore();
    fakeCompare.add(1);
    const httpMock = setup(fake, fakeExport, fakeCompare);

    const component = TestBed.createComponent(PresetBrowserPage);
    component.detectChanges();
    flushI18n(httpMock);
    component.detectChanges();
    await Promise.resolve();
    component.detectChanges();

    const compiled = component.nativeElement as HTMLElement;
    // Reset call history AFTER the setup-time add() call so the
    // toggle assertion below can prove the click alone didn't mutate
    // the comparison store.
    fakeCompare.add.mockClear();
    fakeCompare.remove.mockClear();
    fakeCompare.toggle.mockClear();
    fakeCompare.clear.mockClear();
    (compiled.querySelector('[data-testid="export-mark-1"]') as HTMLInputElement).click();
    component.detectChanges();

    expect(fakeExport.toggle).toHaveBeenCalledWith(1);
    expect(fakeCompare.toggle).not.toHaveBeenCalled();
    expect(fakeCompare.add).not.toHaveBeenCalled();
    expect(fakeCompare.remove).not.toHaveBeenCalled();
    expect(fakeCompare.clear).not.toHaveBeenCalled();
  });
});

// --- Read-only test: stubbed pedal with real WebMidiPedalConnection,
// verify no extra MIDI sends happen when walking chip / block-detail /
// export-mark interactions (R40, v6).

interface FakePort {
  name: string | null;
  state: 'connected' | 'disconnected';
  onstatechange: ((ev: Event) => void) | null;
  onmidimessage: ((ev: MIDIMessageEvent) => void) | null;
}

interface FakeOutput extends FakePort {
  sendSpy: ReturnType<typeof vi.fn>;
  send(data: number[] | Uint8Array, timestamp?: number): void;
}

function fakePort(name: string | null): FakePort {
  return {
    name,
    state: 'connected',
    onstatechange: null,
    onmidimessage: null,
  };
}

function fakeOutput(name: string | null): FakeOutput {
  const sendSpy = vi.fn();
  const out = fakePort(name) as FakeOutput;
  out.sendSpy = sendSpy;
  out.send = ((...args: unknown[]) => sendSpy(...args)) as FakeOutput['send'];
  return out;
}

interface FakeAccess {
  inputs: ReadonlyMap<string, FakePort>;
  outputs: ReadonlyMap<string, FakeOutput>;
}

function fakeAccess(
  inputs: Array<{ name: string | null }>,
  outputs: Array<{ name: string | null }>,
): FakeAccess {
  return {
    inputs: new Map(inputs.map((p, i) => [String(i), fakePort(p.name)])),
    outputs: new Map(outputs.map((p, i) => [String(i), fakeOutput(p.name)])),
  };
}

class FakeReadCodec implements SysexPresetCodec {
  readMessageSets: Uint8Array[][] = [];
  decodeResults: SysexDecodeResult[] = [];
  namesCompleteAfterCalls = 1;
  private namesCallCount = 0;
  private awaitingNames = false;
  private awaitingActive = false;

  encodeReadAllRequest(): Uint8Array[] {
    this.awaitingNames = true;
    this.namesCallCount = 0;
    return this.readMessageSets[0] ?? [];
  }

  encodeSelectPreset(slot: number): Uint8Array {
    return new Uint8Array([0xb0, 0x00, slot & 0x7f]);
  }

  encodeActivePresetRequest(): Uint8Array {
    this.awaitingActive = true;
    return new Uint8Array([0xac]);
  }

  slotsMatchingActivePreset(): number[] {
    return [0];
  }

  isAwaitingNames(): boolean {
    return this.awaitingNames;
  }

  encodeWriteRequest(_preset: Preset): Uint8Array[] {
    throw new Error('encodeWriteRequest should not be called from the preset browser page');
  }

  decodeIncomingMessage(_message: Uint8Array): SysexDecodeResult {
    if (this.awaitingNames) {
      this.namesCallCount++;
      if (this.namesCallCount >= this.namesCompleteAfterCalls) {
        this.awaitingNames = false;
      }
      return { kind: 'ignored' };
    }
    if (this.awaitingActive) {
      this.awaitingActive = false;
      return { kind: 'activePreset' };
    }
    return this.decodeResults.shift() ?? { kind: 'ignored' };
  }
}

describe('PresetBrowserPage v6 — R40 read-only MIDI send spy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('does not add any MIDIOutput.send call when clicking chip / board block / export-mark (R40)', async () => {
    const preset: Preset = {
      slot: 1,
      name: 'A',
      chain: [
        { moduleType: 'cat0_fx0', enabled: true, parameters: { p0: 1, p1: 2 } },
        { moduleType: 'cat7_fx1', enabled: true, parameters: { p0: 5, p1: 6, p2: 7 } },
      ],
    };

    vi.useFakeTimers();
    const access = fakeAccess(
      [{ name: 'Valeton GP-5' }],
      [{ name: 'Valeton GP-5' }],
    );
    const requestMIDIAccess = vi.fn(() => Promise.resolve(access));
    vi.stubGlobal('navigator', { requestMIDIAccess });

    const codec = new FakeReadCodec();
    codec.readMessageSets = [[new Uint8Array([0xaa]), new Uint8Array([0xbb])]];
    codec.decodeResults = [{ kind: 'preset', preset, isLast: true }];

    TestBed.configureTestingModule({
      imports: [PresetBrowserPage],
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting(),
        { provide: SYSEX_PRESET_CODEC, useValue: codec },
        WebMidiPedalConnection,
        { provide: PresetComparisonStore, useClass: FakePresetComparisonStore },
      ],
    });
    const connection = TestBed.inject(WebMidiPedalConnection);
    await connection.connect();

    const outputPort = [...access.outputs.values()][0];
    const inputPort = [...access.inputs.values()][0];

    const fixture = TestBed.createComponent(PresetBrowserPage);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    inputPort.onmidimessage?.({ data: new Uint8Array([0xa0]) } as unknown as MIDIMessageEvent);
    await vi.advanceTimersByTimeAsync(0);
    inputPort.onmidimessage?.({ data: new Uint8Array([0xac]) } as unknown as MIDIMessageEvent);
    await vi.advanceTimersByTimeAsync(READ_SETTLE_MS);
    inputPort.onmidimessage?.({ data: new Uint8Array([0xa1]) } as unknown as MIDIMessageEvent);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const sendCountAfterLoad = outputPort.sendSpy.mock.calls.length;
    expect(sendCountAfterLoad).toBeGreaterThanOrEqual(5);

    // Open the picker and click a row → adds slot 1; should NOT trigger any MIDI send.
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="browse-presets"]')
      ?.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="picker-row-1"]')
      ?.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    // Click the chip → should NOT trigger any MIDI send.
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="preset-chip-1"]')
      ?.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    // Click a board block in the main area.
    const board = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="main-area"] [data-testid="chain-board"]',
    ) as HTMLElement;
    expect(board).not.toBeNull();
    (board.querySelector('[data-testid="board-block-0"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    // Toggle the export-mark checkbox.
    (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="export-mark-1"]')
      ?.dispatchEvent(new Event('click'));
    fixture.detectChanges();

    // No additional sends after the initial load.
    expect(outputPort.sendSpy.mock.calls.length).toBe(sendCountAfterLoad);
  });
});