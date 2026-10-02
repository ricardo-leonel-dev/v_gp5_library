import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PedalGlyph } from './pedal-glyph';
import { PEDAL_GLYPHS } from '../pedal-glyphs';
import { appConfig } from '../../app.config';

function setup(): { httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [PedalGlyph],
    providers: [...appConfig.providers, provideHttpClientTesting()],
  });
  return { httpMock: TestBed.inject(HttpTestingController) };
}

function flushI18n(httpMock: HttpTestingController): void {
  httpMock
    .match((req) => req.url === '/i18n/es.json')
    .forEach((req) => req.flush({}));
  httpMock
    .match((req) => req.url === '/i18n/en.json')
    .forEach((req) => req.flush({}));
}

describe('PedalGlyph (app-pedal-glyph)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  for (let c = 0; c < 10; c++) {
    it(`renders one svg[data-glyph="c${c}"] with the matching path for category ${c} (R5, R6, R7)`, () => {
      const { httpMock } = setup();
      const fixture = TestBed.createComponent(PedalGlyph);
      fixture.componentRef.setInput('categoryIndex', c);
      fixture.detectChanges();
      flushI18n(httpMock);
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const svgs = root.querySelectorAll(`svg[data-glyph="c${c}"]`);
      expect(svgs).toHaveLength(1);
      const svg = svgs[0] as SVGSVGElement;
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('fill')).toBe('none');
      const paths = svg.querySelectorAll('path');
      expect(paths).toHaveLength(1);
      expect(paths[0].getAttribute('d')).toBe(PEDAL_GLYPHS[c].path);
    });
  }

  it('renders nothing when categoryIndex is out of range (R5 fallback)', () => {
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(PedalGlyph);
    fixture.componentRef.setInput('categoryIndex', 10);
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('svg')).toHaveLength(0);
    expect(root.querySelectorAll('path')).toHaveLength(0);
  });

  it('passes svgClass through to the rendered svg', () => {
    const { httpMock } = setup();
    const fixture = TestBed.createComponent(PedalGlyph);
    fixture.componentRef.setInput('categoryIndex', 4);
    fixture.componentRef.setInput('svgClass', 'size-3');
    fixture.detectChanges();
    flushI18n(httpMock);
    fixture.detectChanges();

    const svg = (fixture.nativeElement as HTMLElement).querySelector(
      'svg[data-glyph="c4"]',
    ) as SVGSVGElement;
    expect(svg.getAttribute('class')).toBe('size-3');
  });
});