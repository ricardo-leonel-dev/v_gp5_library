import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ChainBoard } from './chain-board';
import { appConfig } from '../../app.config';
import { categoryStyle, DIMMED_CLASS, NEUTRAL_BLOCK_STYLE } from '../chain-block-view';
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

  it('renders one <button> per chain entry in order with the right titles, and applies grid classes (R22, R38)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
      { moduleType: 'catb_fx0', enabled: true, parameters: {} },
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
    expect(grid.className).toContain('grid-cols-5');
    expect(grid.className).toContain('sm:grid-cols-10');
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
      { moduleType: 'cat0_fx0', enabled: true, parameters: {} },
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
    const spans = Array.from(block.querySelectorAll('span')).map((s) => s.textContent?.trim());
    expect(spans).toEqual(['N/D', 'No reconocido']);
  });

  it('renders the LED only on resolved blocks, never on unknown ones (m3)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat7_fx1', enabled: true, parameters: {} },
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
      'button[data-testid^="board-block-"]',
    );
    // The LED is the only rounded-full element inside a board block.
    expect(blocks[0].querySelectorAll('.rounded-full')).toHaveLength(1);
    expect(blocks[1].querySelectorAll('.rounded-full')).toHaveLength(0);
    expect(blocks[2].querySelectorAll('.rounded-full')).toHaveLength(0);
  });
});
