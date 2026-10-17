import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { BlockDetail } from './block-detail';
import { appConfig } from '../../app.config';
import type { PresetSlot } from '../../midi/preset';

const esTranslations = {
  chainBoard: {
    categories: {
      c0: 'Reducción de ruido',
      c1: 'Pre-efectos',
      c4: 'Amplificador',
      c5: 'Gabinete',
    },
    state_on: 'Activo',
    state_off: 'Bypass',
    parameters: 'Parámetros',
    no_parameters: 'Este bloque no tiene parámetros guardados.',
    unknown_module: 'No se pudo identificar este módulo. Abajo están sus valores sin procesar.',
    browse: 'Ver todos los efectos de {{category}}',
    active: 'En este preset',
    manual_page: 'Manual p. {{page}}',
  },
  presetBrowser: {
    footnote_unverified:
      'Los números de página reflejan una suposición basada en el comportamiento observado del firmware, no un mapeo del fabricante.',
  },
  gp5Fx: {
    c4: {
      f0: 'Amplificador tweed clásico',
      f1: 'Amplificador 59 Bassman limpio',
    },
  },
};

function setup(): { httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [BlockDetail],
    providers: [...appConfig.providers, provideHttpClientTesting()],
  });
  return { httpMock: TestBed.inject(HttpTestingController) };
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock
    .match((req) => req.url === '/i18n/es.json')
    .forEach((req) => req.flush(esTranslations));
  httpMock
    .match((req) => req.url === '/i18n/en.json')
    .forEach((req) => req.flush({}));
}

describe('BlockDetail', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the translated category name, FX title, and on label for an enabled resolved entry (R26, R27, R28)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 10, p1: 20, p2: 30 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Tweedy');
    expect(root.textContent).toContain('Amplificador');
    expect(root.querySelector('[data-testid="block-state"]')?.textContent).toContain('Activo');
  });

  it('shows the off label for a bypassed resolved entry (R28)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx3',
      enabled: false,
      parameters: { p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Bellman 59N');
    expect(root.querySelector('[data-testid="block-state"]')?.textContent).toContain('Bypass');
  });

  it('renders one parameter row per describeParameters entry in order (R29)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx3',
      enabled: true,
      parameters: { p0: 11, p1: 22, p2: 33, p3: 44, p4: 55, p5: 66 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const rows = root.querySelectorAll('[data-testid^="param-row-"]');
    expect(rows).toHaveLength(6);
    expect(rows[0].textContent).toContain('Gain');
    expect(rows[0].textContent).toContain('11');
    expect(rows[1].textContent).toContain('PRES');
    expect(rows[1].textContent).toContain('22');
    expect(rows[5].textContent).toContain('Treble');
    expect(rows[5].textContent).toContain('66');
  });

  it('shows the v6 muted footnote at the bottom of the card — resolved slot (v6 T17, T18)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    // v5 yellow callout is gone (R31).
    const callout = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="mapping-hypothesis"]',
    );
    expect(callout).toBeNull();
    // v6-draft quiet pill is gone (R31).
    const pill = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="detail-unverified-pill"]',
    );
    expect(pill).toBeNull();
    // v6 muted footnote is rendered (R30) — single small muted paragraph
    // at the bottom of the card with no border / icon / color treatment.
    const footnote = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="detail-footnote"]',
    ) as HTMLElement | null;
    expect(footnote).not.toBeNull();
    expect(footnote?.textContent).toContain('Los números de página');
  });

  it('shows the v6 muted footnote for an unknown slot too (v6 T17, T18)', () => {
    // v6: the muted footnote is shown WHILE the detail panel is open,
    // with no resolved-only qualifier — same coverage as the v5
    // hypothesis notice had.
    const slot: PresetSlot = {
      moduleType: 'empty',
      enabled: false,
      parameters: { p0: 1, p2: 3 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const callout = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="mapping-hypothesis"]',
    );
    expect(callout).toBeNull();
    const pill = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="detail-unverified-pill"]',
    );
    expect(pill).toBeNull();
    const footnote = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="detail-footnote"]',
    );
    expect(footnote).not.toBeNull();
  });

  it('shows the unknown-module message and no browse control for an unresolved entry (R31, R32)', () => {
    const slot: PresetSlot = {
      moduleType: 'empty',
      enabled: false,
      parameters: { p0: 1, p2: 3 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="unknown-module"]')?.textContent).toContain('No se pudo identificar');
    expect(root.querySelector('[data-testid="browse-toggle"]')).toBeNull();
  });

  it('browsing an AMP block renders 32 entries in order with translated content (R33, R34)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="browse-toggle"]',
    ) as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const entries = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="fx-entry-"]',
    );
    expect(entries).toHaveLength(32);
    expect((entries[0] as HTMLElement).textContent).toContain('Tweedy');
    expect((entries[0] as HTMLElement).textContent).toContain('Amplificador tweed clásico');
    expect((entries[0] as HTMLElement).textContent).toContain('Gain');
    expect((entries[0] as HTMLElement).textContent).toContain('Tone');
    expect((entries[0] as HTMLElement).textContent).toContain('VOL');
  });

  it('marks only the active FX index with aria-current="true" and the active badge (R35)', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx15',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3, p3: 4, p4: 5, p5: 6 },
    };
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="browse-toggle"]',
    ) as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const entries = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="fx-entry-"]',
    );
    expect((entries[5] as HTMLElement).getAttribute('aria-current')).toBe('true');
    expect((entries[5] as HTMLElement).querySelector('[data-testid="fx-active-badge"]')).not.toBeNull();
    expect((entries[0] as HTMLElement).getAttribute('aria-current')).toBe('false');
    expect((entries[0] as HTMLElement).querySelector('[data-testid="fx-active-badge"]')).toBeNull();
  });
});

// F27 R16-R24 — BlockDetail's editable mode (bypass switch, parameter
// inputs, effect picker). Read-only default keeps working (R24).
describe('BlockDetail (F27 editable mode)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function mount(slot: PresetSlot, editable: boolean) {
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(BlockDetail);
    fixture.componentRef.setInput('slot', slot);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    return { fixture, httpMock };
  }

  it('R16 — sets editable=true and renders a bypass switch, param inputs, and effect picker', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3 },
    };
    const { fixture } = mount(slot, true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="bypass-switch"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="param-input-0"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="effect-picker-select"]')).not.toBeNull();
  });

  it('R24 — read-only default keeps the v6 view: no switch, no inputs, no picker', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3 },
    };
    const { fixture } = mount(slot, false);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="bypass-switch"]')).toBeNull();
    expect(root.querySelector('[data-testid="param-input-0"]')).toBeNull();
    expect(root.querySelector('[data-testid="effect-picker-select"]')).toBeNull();
    // The state indicator still renders.
    expect(root.querySelector('[data-testid="block-state"]')).not.toBeNull();
  });

  it('R17 — clicking the bypass switch emits enabledChange with the new value', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1 },
    };
    const { fixture } = mount(slot, true);
    const events: boolean[] = [];
    (fixture.componentRef.instance as unknown as { enabledChange: { subscribe: (cb: (v: boolean) => void) => void } }).enabledChange.subscribe((v: boolean) => events.push(v));
    const sw = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="bypass-switch"]',
    ) as HTMLButtonElement;
    sw.click();
    fixture.detectChanges();
    expect(events).toEqual([false]);
  });

  it('R19 / R20 — committing a finite param value emits parameterChange with the parsed number', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1, p1: 2, p2: 3 },
    };
    const { fixture } = mount(slot, true);
    type ParamEvent = { key: string; value: number; raw: string };
    const events: ParamEvent[] = [];
    const inst = fixture.componentRef.instance as unknown as {
      parameterChange: { subscribe: (cb: (v: ParamEvent) => void) => void };
    };
    inst.parameterChange.subscribe((v) => events.push(v));
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="param-input-0"]',
    ) as HTMLInputElement;
    input.value = '0.75';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(events).toEqual([{ key: 'Gain', value: 0.75, raw: '0.75' }]);
  });

  it('R20 — committing a non-finite param value shows the inline error and emits with NaN', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1 },
    };
    const { fixture } = mount(slot, true);
    type ParamEvent = { key: string; value: number; raw: string };
    const events: ParamEvent[] = [];
    const inst = fixture.componentRef.instance as unknown as {
      parameterChange: { subscribe: (cb: (v: ParamEvent) => void) => void };
    };
    inst.parameterChange.subscribe((v) => events.push(v));
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="param-input-0"]',
    ) as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="param-error"]')).not.toBeNull();
    expect(events).toEqual([{ key: 'Gain', value: NaN, raw: 'abc' }]);
  });

  it('R22 — selecting a new effect emits moduleChange with the new moduleType', () => {
    const slot: PresetSlot = {
      moduleType: 'cat7_fx1',
      enabled: true,
      parameters: { p0: 1 },
    };
    const { fixture } = mount(slot, true);
    const events: string[] = [];
    const inst = fixture.componentRef.instance as unknown as {
      moduleChange: { subscribe: (cb: (v: string) => void) => void };
    };
    inst.moduleChange.subscribe((v) => events.push(v));
    const select = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="effect-picker-select"]',
    ) as HTMLSelectElement;
    // Pick the second option (a different effect of the same category).
    const target = select.options[1]?.value ?? '';
    expect(target).not.toBe('');
    select.value = target;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(events).toEqual([target]);
  });

  it('R23 — the effect picker is hidden for an unknown module', () => {
    const slot: PresetSlot = {
      moduleType: 'empty',
      enabled: false,
      parameters: {},
    };
    const { fixture } = mount(slot, true);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="effect-picker-select"]')).toBeNull();
  });
});