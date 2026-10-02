import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ChainStrip } from './chain-strip';
import { appConfig } from '../../app.config';
import { categoryStyle, NEUTRAL_BLOCK_STYLE, DIMMED_CLASS } from '../chain-block-view';
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
    imports: [ChainStrip],
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

describe('ChainStrip', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders one block per chain entry in chain order with the right category code (R15)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'catb_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const blocks = root.querySelectorAll('[data-testid^="strip-block-"]');
    expect(blocks).toHaveLength(3);
    expect(blocks[0].getAttribute('data-testid')).toBe('strip-block-0');
    expect(blocks[1].getAttribute('data-testid')).toBe('strip-block-1');
    expect(blocks[2].getAttribute('data-testid')).toBe('strip-block-2');
    // Content check: cat0_fx0/cat7_fx1/catb_fx0 -> PRE/AMP/DLY via displayCategoryCode (N->S
    // is the only one with a different display form, and it isn't in this
    // chain). Guards against an order-by-testid assertion passing even when
    // the wrong block's content is at a given position.
    expect(blocks[0].textContent?.trim()).toBe('PRE');
    expect(blocks[1].textContent?.trim()).toBe('AMP');
    expect(blocks[2].textContent?.trim()).toBe('DLY');
  });

  it('container has flex + w-full; blocks have flex-1 + min-w-0 (R39)', () => {
    const chain: PresetSlot[] = [{ moduleType: 'cat7_fx1', enabled: true, parameters: {} }];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const container = root.querySelector('[data-testid="chain-strip"]') as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.className).toContain('flex');
    expect(container.className).toContain('w-full');
    const block = container.querySelector('[data-testid="strip-block-0"]') as HTMLElement;
    expect(block.className).toContain('flex-1');
    expect(block.className).toContain('min-w-0');
  });

  it('shows the category code on resolved blocks and applies categoryStyle (R16)', () => {
    const chain: PresetSlot[] = [{ moduleType: 'cat0_fx0', enabled: true, parameters: {} }];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const block = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="strip-block-0"]',
    ) as HTMLElement;
    expect(block.textContent?.trim()).toBe('PRE');
    // The DOM re-orders class names alphabetically, so check the category
    // style's tokens individually rather than the full literal string.
    for (const cls of categoryStyle(1).split(/\s+/)) {
      expect(block.className).toContain(cls);
    }
  });

  it('applies opacity-40 to a bypassed entry and not to an enabled one (R17, R18)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx3', enabled: false, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect((blocks[0] as HTMLElement).className).not.toContain(DIMMED_CLASS);
    expect((blocks[1] as HTMLElement).className).toContain(DIMMED_CLASS);
  });

  it('renders neutral blocks at the right positions and preserves chain length (R19)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'empty', enabled: false, parameters: {} },
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect(blocks).toHaveLength(4);
    for (const cls of NEUTRAL_BLOCK_STYLE.split(/\s+/)) {
      expect((blocks[1] as HTMLElement).className).toContain(cls);
      expect((blocks[3] as HTMLElement).className).toContain(cls);
    }
    expect((blocks[1] as HTMLElement).className).toContain(DIMMED_CLASS);
    expect((blocks[3] as HTMLElement).className).not.toContain(DIMMED_CLASS);
    expect((blocks[1] as HTMLElement).textContent?.trim()).toBe('N/D');
  });

  it('aria-label is fully translated: category, FX title and on/off state; unknown blocks use unknown_short/unknown (m1, m2)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat7_fx1', enabled: false, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect(blocks[0].getAttribute('aria-label')).toBe('PRE: COMP, Activo');
    expect(blocks[1].getAttribute('aria-label')).toBe('AMP: Tweedy, Bypass');
    expect(blocks[2].getAttribute('aria-label')).toBe('N/D: No reconocido, Activo');
  });

  it('renders one pedal glyph with the right data-glyph on every resolved block (R8)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} }, // PRE (idx 1)
      { moduleType: 'cat3_fx0', enabled: true, parameters: {} }, // DST (idx 2)
      { moduleType: 'catb_fx0', enabled: true, parameters: {} }, // DLY (idx 8)
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect(blocks[0].querySelectorAll('svg[data-glyph="c1"]')).toHaveLength(1);
    expect(blocks[1].querySelectorAll('svg[data-glyph="c2"]')).toHaveLength(1);
    expect(blocks[2].querySelectorAll('svg[data-glyph="c8"]')).toHaveLength(1);
    // And no other glyph elements on these blocks.
    expect(blocks[0].querySelectorAll('svg[data-glyph]')).toHaveLength(1);
    expect(blocks[1].querySelectorAll('svg[data-glyph]')).toHaveLength(1);
    expect(blocks[2].querySelectorAll('svg[data-glyph]')).toHaveLength(1);
  });

  it('renders no pedal glyph inside an unknown strip block (R9)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'empty', enabled: false, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    expect(blocks[1].querySelectorAll('svg[data-glyph]')).toHaveLength(0);
    expect(blocks[2].querySelectorAll('svg[data-glyph]')).toHaveLength(0);
  });

  it('every strip block carries h-8 and the inset-bottom-shadow class (R10)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
      { moduleType: 'empty', enabled: false, parameters: {} },
      { moduleType: 'cat99_fx0', enabled: true, parameters: {} },
    ];
    const { httpMock } = setup();

    const fixture = TestBed.createComponent(ChainStrip);
    fixture.componentRef.setInput('chain', chain);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const blocks = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="strip-block-"]',
    );
    for (const block of Array.from(blocks)) {
      expect((block as HTMLElement).className).toContain('h-8');
      expect((block as HTMLElement).className).toContain(
        'shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]',
      );
    }
  });

  // silence unused import warnings from vi in some configs
  it('noop to keep vi import in scope for lint parity', () => {
    expect(typeof vi.fn).toBe('function');
  });
});