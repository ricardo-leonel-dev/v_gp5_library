import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ChainBoard } from './chain-board';
import { appConfig } from '../../app.config';
import { categoryStyle, DIMMED_CLASS, NEUTRAL_BLOCK_STYLE } from '../chain-block-view';
import { PEDAL_GLYPHS } from '../pedal-glyphs';
import type { PresetSlot } from '../../midi/preset';

const esTranslations = {
  chainBoard: {
    block_aria: '{{category}}: {{fx}}, {{state}}',
    state_on: 'Activo',
    state_off: 'Bypass',
    unknown: 'No reconocido',
    // Deliberately not '?', so a template that hardcodes '?' instead of
    // translating chainBoard.unknown_short fails (m2).
    unknown_short: 'N/D',
  },
};

function setup(): { httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [ChainBoard],
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

describe('ChainBoard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // --- F14 R22, F14 R38 ---------------------------------------------------

  it('renders one <button> per chain entry in order with the right titles, and applies grid classes (R22, R38)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} }, // AMP / Tweedy
      { moduleType: 'catb_fx0', enabled: true, parameters: {} }, // DLY / Pure
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const grid = root.querySelector('[data-testid="chain-board"]') as HTMLElement;
    expect(grid).not.toBeNull();
    // Always 5 columns (R16, after spec amendment v2 — no `sm:` variant).
    expect(grid.className).toContain('grid-cols-5');
    expect(grid.className).not.toContain('sm:grid-cols-10');
    const buttons = root.querySelectorAll('button[data-testid^="board-block-"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute('data-testid')).toBe('board-block-0');
    expect(buttons[1].getAttribute('data-testid')).toBe('board-block-1');
    // Content check: cat7_fx1 = AMP/Tweedy, catb_fx0 = DLY/Pure (m6 —
    // order-by-testid alone is tautological because the @for position is
    // always ascending).
    expect((buttons[0] as HTMLElement).textContent).toContain('Tweedy');
    expect((buttons[1] as HTMLElement).textContent).toContain('Pure');
  });

  it('reflects selectedIndex in aria-pressed (R24)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'catb_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', 1);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    expect((buttons[0] as HTMLElement).getAttribute('aria-pressed')).toBe('false');
    expect((buttons[1] as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('emits blockSelected with the clicked position (R24)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx3', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx4', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const onSelect = vi.fn();
    const sub = fixture.componentInstance.blockSelected.subscribe(onSelect);

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    (buttons[1] as HTMLButtonElement).click();
    expect(onSelect).toHaveBeenCalledWith(1);

    sub.unsubscribe();
  });

  it('R16: a block for cat0_fx0 shows the PRE code and carries every categoryStyle(1) token', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} }, // PRE / COMP (idx 1)
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const block = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.textContent).toContain('PRE');
    expect(block.textContent).toContain('COMP');
    for (const cls of categoryStyle(1).split(/\s+/)) {
      expect(block.className).toContain(cls);
    }
  });

  it('R17, R18: a bypassed block carries opacity-40 and an enabled one does not', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx3', enabled: false, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="board-block-"]',
    );
    expect((blocks[0] as HTMLElement).className).not.toContain(DIMMED_CLASS);
    expect((blocks[1] as HTMLElement).className).toContain(DIMMED_CLASS);
  });

  it('R19: "empty" and cat99_fx0 render with every NEUTRAL_BLOCK_STYLE token and the translated chainBoard.unknown title; block count equals chain.length', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'empty', enabled: false, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="board-block-"]',
    );
    expect(blocks).toHaveLength(3);
    for (const cls of NEUTRAL_BLOCK_STYLE.split(/\s+/)) {
      expect((blocks[1] as HTMLElement).className).toContain(cls);
      expect((blocks[2] as HTMLElement).className).toContain(cls);
    }
    expect((blocks[1] as HTMLElement).textContent).toContain('No reconocido');
    expect((blocks[2] as HTMLElement).textContent).toContain('No reconocido');
  });

  it('aria-label is fully translated: category, FX title and on/off state; unknown blocks use unknown_short/unknown (m1, m2)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx1', enabled: false, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    expect(blocks[0].getAttribute('aria-label')).toBe('PRE: COMP, Activo');
    expect(blocks[1].getAttribute('aria-label')).toBe('AMP: Tweedy, Bypass');
    expect(blocks[2].getAttribute('aria-label')).toBe('N/D: No reconocido, Activo');
  });

  it('an unknown block shows the translated chainBoard.unknown_short code (m2)', () => {
    const chain: PresetSlot[] = [{ moduleType: 'cat99_fx0', enabled: true, parameters: {} }];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const block = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="board-block-0"]',
    ) as HTMLElement;
    // The unknown block shows exactly the translated unknown_short + chainBoard.unknown title.
    expect(block.textContent).toContain('N/D');
    expect(block.textContent).toContain('No reconocido');
  });

  // --- m3 LED selector -----------------------------------------------------
  // The LED is `size-1.5 rounded-full`. AMP / CAB / EQ have no knob row, but
  // the LED is still rendered; unknown blocks have neither. RVB has 4
  // knobs (size-2.5) but still one LED.
  it('renders the LED only on resolved blocks, never on unknown ones (m3)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} }, // AMP (no knobs)
      { moduleType: 'empty', enabled: false, parameters: {} }, // unknown
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} }, // unknown
      { moduleType: 'catc_fxb', enabled: true, parameters: {} }, // RVB (4 knobs, 1 LED)
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    expect(blocks[0].querySelectorAll('.size-1\\.5.rounded-full')).toHaveLength(1); // AMP LED
    expect(blocks[1].querySelectorAll('.size-1\\.5.rounded-full')).toHaveLength(0); // empty
    expect(blocks[2].querySelectorAll('.size-1\\.5.rounded-full')).toHaveLength(0); // cat99
    expect(blocks[3].querySelectorAll('.size-1\\.5.rounded-full')).toHaveLength(1); // RVB
  });

  // --- T8 (amended): per-resolved-block glyph / knobs / sliders / footswitch
  //     plus per-kind chassis selectors (handle / vents / grille / sliders / jacks).

  it('each resolved board block has one matching glyph, the right knob and slider counts, and one footswitch (R11, R12, R13)', () => {
    // One block per kind:
    //   cat0_fx1b -> NR (stompbox, 1 knob, 0 sliders, 2 jacks)
    //   cat3_fx0  -> DST (stompbox, 3 knobs, 0 sliders, 2 jacks)
    //   catc_fxb  -> RVB (stompbox, 4 knobs in 2x2, 0 sliders, 2 jacks)
    //   cat7_fx1  -> AMP (amp, 0 knobs, 0 sliders, handle + 2 vents)
    //   cata_fx1  -> CAB (cabinet, 0 knobs, 0 sliders, handle + 1 grille)
    //   cat1_fx35 -> EQ (eq, 0 knobs, 4 sliders)
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx1b', enabled: true, parameters: {} }, // NR
      { moduleType: 'cat3_fx0', enabled: true, parameters: {} }, // DST
      { moduleType: 'catc_fxb', enabled: true, parameters: {} }, // RVB
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} }, // AMP
      { moduleType: 'cata_fx1', enabled: true, parameters: {} }, // CAB
      { moduleType: 'cat1_fx35', enabled: true, parameters: {} }, // EQ
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    const expected: ReadonlyArray<{ idx: number; knobs: number; sliders: number }> = [
      { idx: 0, knobs: PEDAL_GLYPHS[0].knobs, sliders: PEDAL_GLYPHS[0].sliders },
      { idx: 2, knobs: PEDAL_GLYPHS[2].knobs, sliders: PEDAL_GLYPHS[2].sliders },
      { idx: 9, knobs: PEDAL_GLYPHS[9].knobs, sliders: PEDAL_GLYPHS[9].sliders },
      { idx: 4, knobs: PEDAL_GLYPHS[4].knobs, sliders: PEDAL_GLYPHS[4].sliders },
      { idx: 5, knobs: PEDAL_GLYPHS[5].knobs, sliders: PEDAL_GLYPHS[5].sliders },
      { idx: 6, knobs: PEDAL_GLYPHS[6].knobs, sliders: PEDAL_GLYPHS[6].sliders },
    ];
    for (let i = 0; i < expected.length; i++) {
      const block = blocks[i] as HTMLElement;
      expect(block.querySelectorAll(`svg[data-glyph="c${expected[i].idx}"]`)).toHaveLength(1);
      expect(block.querySelectorAll('[data-knob]')).toHaveLength(expected[i].knobs);
      expect(block.querySelectorAll('[data-slider]')).toHaveLength(expected[i].sliders);
      expect(block.querySelectorAll('[data-footswitch]')).toHaveLength(1);
    }
  });

  it('amp chassis carries a handle and exactly 2 vent slits (R12)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} }, // AMP
    ];
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const block = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(1);
    expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(2);
    expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-knob]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-slider]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-jack]')).toHaveLength(0);
  });

  it('cabinet chassis carries a handle and a speaker grille (R12)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cata_fx1', enabled: true, parameters: {} }, // CAB
    ];
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const block = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(1);
    expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(1);
    expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-knob]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-slider]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-jack]')).toHaveLength(0);
  });

  it('eq chassis carries 4 sliders and no knobs (R12)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat1_fx35', enabled: true, parameters: {} }, // EQ
    ];
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const block = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.querySelectorAll('[data-slider]')).toHaveLength(4);
    expect(block.querySelectorAll('[data-knob]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-jack]')).toHaveLength(0);
  });

  it('stompbox chassis carries exactly 2 jacks, the right knob count, and no amp/cabinet/eq-only marks (R12)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx1b', enabled: true, parameters: {} }, // NR (1 knob)
      { moduleType: 'cat3_fx0', enabled: true, parameters: {} }, // DST (3 knobs)
      { moduleType: 'catc_fxb', enabled: true, parameters: {} }, // RVB (4 knobs)
    ];
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();
    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'button[data-testid^="board-block-"]',
    );
    const knobsPerBlock = [PEDAL_GLYPHS[0].knobs, PEDAL_GLYPHS[2].knobs, PEDAL_GLYPHS[9].knobs];
    for (let i = 0; i < knobsPerBlock.length; i++) {
      const block = blocks[i] as HTMLElement;
      expect(block.querySelectorAll('[data-jack]')).toHaveLength(2);
      expect(block.querySelectorAll('[data-knob]')).toHaveLength(knobsPerBlock[i]);
      expect(block.querySelectorAll('[data-slider]')).toHaveLength(0);
      expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(0);
      expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(0);
      expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(0);
    }
  });

  // --- T9 (amended): unknown blocks render none of the drawn pedal parts ---

  it('an "empty" block renders no glyph, knobs, sliders, jacks, footswitch, handle, vent or grille (R14)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'empty', enabled: false, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const block = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.querySelectorAll('[data-glyph]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-knob]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-slider]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-footswitch]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-jack]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(0);
    expect(block.querySelectorAll('.size-1\\.5.rounded-full')).toHaveLength(0);
  });

  it('a cat99_fx0 (unknown, enabled) block renders no drawn pedal parts (R14)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const block = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="board-block-0"]',
    ) as HTMLElement;
    expect(block.querySelectorAll('[data-glyph]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-knob]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-slider]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-footswitch]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-jack]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-handle]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-vent]')).toHaveLength(0);
    expect(block.querySelectorAll('[data-chassis-grille]')).toHaveLength(0);
  });

  // --- T10: cable / grid / cell-wrapper layering --------------------------

  it('cable is a serpentine SVG with z-0 and a non-empty path, grid has relative + z-10, and every board block is wrapped in a slate cell (R15, R16, R17)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: false, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainBoard);
    fixture.componentRef.setInput('chain', chain);
    fixture.componentRef.setInput('selectedIndex', null);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    // Cable is now a serpentine SVG (R15 amendment v2): element type, z-0,
    // aria-hidden, and a <path> with a non-empty `d` so a regression where
    // the SVG is empty fails this test.
    const cable = root.querySelector('[data-testid="chain-cable"]') as SVGElement | null;
    expect(cable).not.toBeNull();
    expect(cable!.tagName.toLowerCase()).toBe('svg');
    // SVG elements expose `className` as SVGAnimatedString, not a plain string.
    // Read the literal class attribute instead.
    const cableClass = cable!.getAttribute('class') ?? '';
    expect(cableClass).toContain('z-0');
    expect(cableClass).toContain('absolute');
    expect(cableClass).toContain('pointer-events-none');
    expect(cable!.getAttribute('aria-hidden')).toBe('true');
    const cablePath = cable!.querySelector('path');
    expect(cablePath).not.toBeNull();
    const cableD = cablePath!.getAttribute('d') ?? '';
    expect(cableD.length).toBeGreaterThan(0);
    // The serpentine shape: top L→R + right wrap + bottom segment.
    // Pinned against the spec's literal start/end + a "C" curve command
    // somewhere in the middle (the right-edge wrap).
    expect(cableD).toMatch(/M\s/);
    expect(cableD).toContain('H');
    expect(cableD).toContain('C');

    const grid = root.querySelector('[data-testid="chain-board"]') as HTMLElement;
    expect(grid.className).toContain('relative');
    expect(grid.className).toContain('z-10');
    expect(grid.className).toContain('grid-cols-5');
    expect(grid.className).not.toContain('sm:grid-cols-10');

    const buttons = root.querySelectorAll('button[data-testid^="board-block-"]');
    expect(buttons).toHaveLength(2);
    for (const btn of Array.from(buttons)) {
      const parent = (btn as HTMLElement).parentElement as HTMLElement;
      expect(parent).not.toBeNull();
      expect(parent.className).toContain('rounded-lg');
      expect(parent.className).toContain('bg-slate-50');
      expect(parent.className).toContain('dark:bg-slate-900');
      expect(parent.children).toHaveLength(1);
    }
  });
});