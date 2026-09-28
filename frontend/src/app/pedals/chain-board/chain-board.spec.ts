import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ChainBoard } from './chain-board';
import { appConfig } from '../../app.config';
import type { PresetSlot } from '../../midi/preset';

const esTranslations = {
  chainBoard: {
    unknown: 'No reconocido',
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

  it('renders one <button> per chain entry in order and applies grid classes (R22, R38)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat8_fx0', enabled: true, parameters: {} },
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
  });

  it('reflects selectedIndex in aria-pressed (R24)', () => {
    const chain: PresetSlot[] = [
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat8_fx0', enabled: true, parameters: {} },
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
      { moduleType: 'cat4_fx0', enabled: true, parameters: {} },
      { moduleType: 'cat4_fx1', enabled: true, parameters: {} },
      { moduleType: 'cat4_fx2', enabled: true, parameters: {} },
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
});