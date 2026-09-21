import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { appConfig } from './app.config';

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [...appConfig.providers, provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the language switcher and dark mode toggle', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // Flush the Transloco translation-file load(s) the dark mode toggle's
    // *transloco directive triggers, so the request doesn't leak into the
    // next test as an unhandled error.
    httpMock.match(() => true).forEach((req) => req.flush({}));

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-language-switcher')).toBeTruthy();
    expect(compiled.querySelector('app-dark-mode-toggle')).toBeTruthy();
  });
});
