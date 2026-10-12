import { describe, expect, test, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, type Translation, type TranslocoLoader } from '@jsverse/transloco';
import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PedalConnectButton } from './pedal-connect-button';
import { PedalConnectFlow } from '../pedal-connect-flow.service';
import { PedalPresetsStore } from '../pedal-presets.store';

@Injectable({ providedIn: 'root' })
class StubTranslocoLoader implements TranslocoLoader {
  getTranslation(_lang: string): Observable<Translation> {
    return of({
      pedalButton: {
        connect: 'Connect to GP-5',
        connecting: 'Connecting…',
        reading: 'Reading presets…',
        read: 'Read GP-5 presets',
        unsupported_hint: 'Browser does not support Web MIDI',
        dismiss_error: 'Dismiss',
      },
    } as Translation);
  }
}

function setup(opts: { supported?: boolean; connected?: boolean; reading?: boolean } = {}): {
  flow: { start: ReturnType<typeof vi.fn> };
  fixture: ReturnType<typeof TestBed.createComponent<PedalConnectButton>>;
} {
  const connected = opts.connected ?? false;
  const reading = opts.reading ?? false;
  const supported = opts.supported ?? true;
  const flow = {
    supported,
    connectionState: signal(connected ? 'connected' : 'not-connected'),
    reading: signal(reading),
    error: signal<string | null>(null),
    start: vi.fn().mockResolvedValue(undefined),
    dismissError: vi.fn(),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PedalConnectButton],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideTransloco({
        config: { availableLangs: ['es'], defaultLang: 'es', fallbackLang: 'es' },
        loader: StubTranslocoLoader,
      }),
      { provide: PedalConnectFlow, useValue: flow },
      { provide: PedalPresetsStore, useValue: { read: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PedalConnectButton);
  fixture.detectChanges();
  return { flow, fixture };
}

describe('PedalConnectButton (R46-R49, R67)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  test('renders pedal-connect testid and "Connect to GP-5" label by default', () => {
    const { fixture } = setup();
    const root = fixture.nativeElement as HTMLElement;
    const btn = root.querySelector('[data-testid="pedal-connect"]')!;
    expect(btn).toBeTruthy();
    expect(btn.textContent?.trim()).toBe('Connect to GP-5');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  test('connected: shows "Read GP-5 presets" label and a connected dot', () => {
    const { fixture } = setup({ connected: true });
    const root = fixture.nativeElement as HTMLElement;
    const btn = root.querySelector('[data-testid="pedal-connect"]')!;
    expect(btn.textContent?.trim()).toBe('Read GP-5 presets');
    expect(btn.querySelector('span[aria-hidden="true"]')).not.toBeNull();
  });

  test('clicking the button calls flow.start()', () => {
    const { fixture, flow } = setup();
    const btn = fixture.nativeElement.querySelector('[data-testid="pedal-connect"]') as HTMLButtonElement;
    btn.click();
    expect(flow.start).toHaveBeenCalledTimes(1);
  });

  test('not supported: disabled with title = unsupported_hint', () => {
    const { fixture } = setup({ supported: false });
    const root = fixture.nativeElement as HTMLElement;
    const btn = root.querySelector('[data-testid="pedal-connect"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('Browser does not support Web MIDI');
  });

  test('disabled while reading (R67): label is pedalButton.reading, button disabled, no nav', () => {
    const { fixture } = setup({ connected: true, reading: true });
    const root = fixture.nativeElement as HTMLElement;
    const btn: HTMLButtonElement | null = root.querySelector('[data-testid="pedal-connect"]');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    expect(btn!.textContent?.trim()).toBe('Reading presets…');
  });
});