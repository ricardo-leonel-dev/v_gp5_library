import { afterEach, describe, expect, test, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ChangeDetectionStrategy, Component, Injectable, signal } from '@angular/core';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { UnsupportedBrowserMessage, type UnsupportedBrowserVariant } from './unsupported-browser-message';

const TEXT = {
  title: 'Este navegador no puede conectarse al GP-5.',
  body: 'BODY requiere Web MIDI.',
  browsers: 'BROWSERS Chrome, Edge.',
  footnote: 'FOOTNOTE canciones guardadas.',
  insecure_body: 'INSECURE_BODY https://.',
  insecure_compact: 'INSECURE_COMPACT https:// o localhost.',
};

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({ unsupportedBrowser: TEXT } as Translation);
  }
}

@Component({
  imports: [UnsupportedBrowserMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-unsupported-browser-message [variant]="variant()" />
    @if (twice()) {
      <app-unsupported-browser-message [variant]="variant()" />
    }
  `,
})
class Host {
  readonly variant = signal<UnsupportedBrowserVariant>('full');
  readonly twice = signal(false);
}

@Component({
  imports: [UnsupportedBrowserMessage],
  template: `<app-unsupported-browser-message />`,
})
class DefaultHost {}

function mount(opts: { variant?: UnsupportedBrowserVariant; twice?: boolean } = {}): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
    ],
  });
  if (opts.variant === undefined && !opts.twice) {
    const fixture = TestBed.createComponent(DefaultHost);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.variant.set(opts.variant ?? 'full');
  fixture.componentInstance.twice.set(opts.twice ?? false);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function messages(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-testid="unsupported-browser-message"]'));
}

describe('UnsupportedBrowserMessage (F9)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('R5, R6 — default (no variant binding): status section with h2 title, body, browsers, footnote', () => {
    const root = mount();
    const [msg] = messages(root);
    expect(msg).toBeTruthy();
    expect(msg.tagName).toBe('SECTION');
    expect(msg.getAttribute('role')).toBe('status');
    expect(msg.querySelector('h2')?.textContent?.trim()).toBe(TEXT.title);
    const text = msg.textContent ?? '';
    expect(text).toContain(TEXT.body);
    expect(text).toContain(TEXT.browsers);
    expect(text).toContain(TEXT.footnote);
    expect(text).not.toContain(TEXT.insecure_body);
  });

  test('R7 — aria-labelledby points at its own h2, and ids are unique per instance', () => {
    const root = mount({ variant: 'full', twice: true });
    const all = messages(root);
    expect(all).toHaveLength(2);
    for (const msg of all) {
      const h2 = msg.querySelector('h2')!;
      expect(h2.id).not.toBe('');
      expect(msg.getAttribute('aria-labelledby')).toBe(h2.id);
    }
    expect(all[0].querySelector('h2')!.id).not.toBe(all[1].querySelector('h2')!.id);
  });

  test('R5, R8 — compact: single <p> root with title + browsers, no h2/svg/body/footnote', () => {
    const root = mount({ variant: 'compact' });
    const [msg] = messages(root);
    expect(msg.tagName).toBe('P');
    expect(msg.getAttribute('role')).toBe('status');
    const text = msg.textContent ?? '';
    expect(text).toContain(TEXT.title);
    expect(text).toContain(TEXT.browsers);
    expect(text).not.toContain(TEXT.body);
    expect(text).not.toContain(TEXT.footnote);
    expect(text).not.toContain(TEXT.insecure_compact);
    expect(msg.querySelector('h2')).toBeNull();
    expect(msg.querySelector('svg')).toBeNull();
  });

  test.each<UnsupportedBrowserVariant>(['full', 'compact'])(
    'R9 — %s variant has no interactive or focusable elements',
    (variant) => {
      const root = mount({ variant });
      const [msg] = messages(root);
      expect(msg.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
      expect(msg.hasAttribute('tabindex')).toBe(false);
    },
  );

  test('R29 — insecure context, full: insecure_body replaces body; title, browsers, footnote stay', () => {
    vi.stubGlobal('isSecureContext', false);
    const root = mount();
    const [msg] = messages(root);
    expect(msg.querySelector('h2')?.textContent?.trim()).toBe(TEXT.title);
    const text = msg.textContent ?? '';
    expect(text).toContain(TEXT.insecure_body);
    expect(text).toContain(TEXT.browsers);
    expect(text).toContain(TEXT.footnote);
    expect(text).not.toContain(TEXT.body);
  });

  test('R30 — insecure context, compact: title + insecure_compact, no browsers line', () => {
    vi.stubGlobal('isSecureContext', false);
    const root = mount({ variant: 'compact' });
    const [msg] = messages(root);
    const text = msg.textContent ?? '';
    expect(text).toContain(TEXT.title);
    expect(text).toContain(TEXT.insecure_compact);
    expect(text).not.toContain(TEXT.browsers);
  });

  test.each<UnsupportedBrowserVariant>(['full', 'compact'])(
    'R6, R8 — secure context (isSecureContext = true), %s: no insecure copy',
    (variant) => {
      vi.stubGlobal('isSecureContext', true);
      const root = mount({ variant });
      const text = messages(root)[0].textContent ?? '';
      expect(text).not.toContain(TEXT.insecure_body);
      expect(text).not.toContain(TEXT.insecure_compact);
      expect(text).toContain(TEXT.browsers);
    },
  );
});
