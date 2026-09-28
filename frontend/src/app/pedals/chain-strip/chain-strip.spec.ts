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
    unknown_short: '?',
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

  it('renders one block per chain entry in chain order (R15)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat1_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat8_fx0', enabled: true, parameters: {} },
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
  });

  it('container has flex + w-full; blocks have flex-1 + min-w-0 (R39)', () => {
    const chain: PresetSlot[] = [{ moduleType: 'cat4_fx0', enabled: true, parameters: {} }];
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
    const chain: PresetSlot[] = [{ moduleType: 'cat1_fx0', enabled: true, parameters: {} }];
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
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat4_fx1', enabled: false, parameters: {} },
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
      { moduleType: 'cat1_fx0', enabled: true, parameters: {} },
      { moduleType: 'empty', enabled: false, parameters: {} },
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
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
    expect((blocks[1] as HTMLElement).textContent?.trim()).toBe('?');
  });
});