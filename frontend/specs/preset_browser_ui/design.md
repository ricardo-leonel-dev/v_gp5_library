# Design — preset_browser_ui

## Files to touch

- `src/app/pedals/selected-preset.service.ts` (new) — `SelectedPresetStore` (R1, R2).
- `src/app/pedals/selected-preset.service.spec.ts` (new) — plain Vitest, no `TestBed` (mirrors
  `WebMidiPedalConnection`'s `isSupported()` tests — no injected dependencies, safe to construct directly).
- `src/app/pedals/preset-browser-page/preset-browser-page.ts` + `.html` (new) — the page component (R3–R12,
  R15).
- `src/app/pedals/preset-browser-page/preset-browser-page.spec.ts` (new) — `TestBed`-based, reusing
  `appConfig.providers` per `docs/conventions.md`.
- `src/app/pedals/pedal-connection-page/pedal-connection-page.ts` + `.html` — add the "view presets" link
  (R14); add `RouterLink` to the component's `imports` array.
- `src/app/pedals/pedal-connection-page/pedal-connection-page.spec.ts` — extend with the link-visibility
  tests (R14).
- `src/app/app.routes.ts` — add the guarded, lazy-loaded `pedal/presets` route (R13).
- `src/app/app.routes.spec.ts` (new) — plain Vitest, asserts the new route's shape (R13).
- `public/i18n/en.json`, `public/i18n/es.json` — new `presetBrowser` namespace, plus `pedal.view_presets`
  (every requirement below that renders translated text).

## `SelectedPresetStore` — the seam `save_preset_dialog` will consume later

```ts
// src/app/pedals/selected-preset.service.ts
import { Injectable, signal } from '@angular/core';
import type { Preset } from '../midi/preset';

@Injectable({ providedIn: 'root' })
export class SelectedPresetStore {
  private readonly selectedPresetSignal = signal<Preset | null>(null);
  readonly selectedPreset = this.selectedPresetSignal.asReadonly();

  select(preset: Preset): void {
    this.selectedPresetSignal.set(preset);
  }
}
```

This is deliberately the *entire* integration surface with `save_preset_dialog` (feature 4, still
`pending`): this feature only writes to it (R15); a future feature reads `selectedPreset` once its own page
exists. See "Discarded alternatives" for why this is a signal-based store rather than a concrete navigation
target.

## `PresetBrowserPage`

```ts
// src/app/pedals/preset-browser-page/preset-browser-page.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Preset } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { SelectedPresetStore } from '../selected-preset.service';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-preset-browser-page',
  imports: [TranslocoDirective],
  templateUrl: './preset-browser-page.html',
})
export class PresetBrowserPage implements OnInit {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly selectedPresetStore = inject(SelectedPresetStore);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly loadState = signal<LoadState>('idle');
  readonly presets = signal<Preset[]>([]);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.supported) return; // R3
    if (this.connectionState() !== 'connected') return; // R4
    void this.loadPresets(); // R5
  }

  chainSummary(preset: Preset): string {
    return preset.chain
      .filter((entry) => entry.enabled)
      .map((entry) => entry.moduleType)
      .join(', '); // R9 (template falls back to the empty-chain placeholder when this is '', R10)
  }

  selectPreset(preset: Preset): void {
    this.selectedPresetStore.select(preset); // R15
  }

  private async loadPresets(): Promise<void> {
    this.loadState.set('loading'); // R6
    this.error.set(null);
    try {
      this.presets.set(await this.pedal.readPresets()); // R7 (array order preserved as-is)
      this.loadState.set('loaded');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'unknown'); // R11
      this.loadState.set('error');
    }
  }
}
```

Template (`preset-browser-page.html`), same `*transloco="let t"` + Tailwind-only shape as
`pedal-connection-page.html`:

```html
<div *transloco="let t" class="mx-auto max-w-3xl px-4 py-10">
  <h1 class="text-2xl font-semibold text-slate-900 dark:text-slate-100">{{ t('presetBrowser.title') }}</h1>

  @if (!supported) {
    <p class="mt-4 text-sm text-slate-600 dark:text-slate-400" data-testid="unsupported-message">
      {{ t('pedal.unsupported') }}
    </p>
  } @else if (connectionState() !== 'connected') {
    <p class="mt-4 text-sm text-slate-600 dark:text-slate-400" data-testid="not-connected-message">
      {{ t('presetBrowser.not_connected') }}
    </p>
  } @else {
    @if (loadState() === 'loading') {
      <p class="mt-4 text-sm text-slate-600 dark:text-slate-400" data-testid="loading">
        {{ t('presetBrowser.loading') }}
      </p>
    }
    @if (loadState() === 'error') {
      <p class="mt-4 text-sm text-red-600 dark:text-red-400" data-testid="preset-error">
        {{ t('presetBrowser.' + error()) }}
      </p>
    }
    @if (loadState() === 'loaded') {
      @if (presets().length === 0) {
        <p class="mt-4 text-sm text-slate-600 dark:text-slate-400" data-testid="no-presets">
          {{ t('presetBrowser.no_presets') }}
        </p>
      } @else {
        <ul class="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
          @for (preset of presets(); track preset.slot) {
            <li class="flex items-center justify-between py-3" [attr.data-testid]="'preset-row-' + preset.slot">
              <div>
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {{ preset.slot }} — {{ preset.name }}
                </p>
                <p
                  class="text-xs text-slate-500 dark:text-slate-400"
                  [attr.data-testid]="'preset-chain-' + preset.slot"
                >
                  {{ chainSummary(preset) || t('presetBrowser.empty_chain') }}
                </p>
              </div>
              <button
                type="button"
                (click)="selectPreset(preset)"
                [attr.data-testid]="'select-preset-' + preset.slot"
                class="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                {{ t('presetBrowser.select') }}
              </button>
            </li>
          }
        </ul>
      }
    }
  }
</div>
```

The `@if (!supported) / @else if (connectionState() !== 'connected') / @else` chain is mutually exclusive by
construction, so R3/R4/R5's guards and R7/R11/R12's `loaded`/`error`/empty branches never render
simultaneously.

## Route (R13)

`src/app/app.routes.ts`, inserted after the existing `pedal` route:

```ts
{
  path: 'pedal/presets',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./pedals/preset-browser-page/preset-browser-page').then((m) => m.PresetBrowserPage),
},
```

Same guard as `pedal` (R13's "using the same route guard" is the concrete, testable half of that
requirement — see `app.routes.spec.ts` below).

## Pedal connection page link (R14)

`pedal-connection-page.ts` adds `RouterLink` to `imports`; `pedal-connection-page.html` adds, inside the
existing `@else` (Web-MIDI-supported) branch, after the connection-state paragraph:

```html
@if (connectionState() === 'connected') {
  <a
    routerLink="/pedal/presets"
    data-testid="presets-link"
    class="mt-4 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
  >
    {{ t('pedal.view_presets') }}
  </a>
}
```

## Error handling

Matches `docs/architecture.md` principle 3, same pattern `PedalConnectionPage` already establishes:
`readPresets()` throws/rejects with a stable string-keyed `Error` (`'not_connected'`,
`'request_in_progress'`, `'read_timeout'`, `'invalid_response'`, or a codec-specific key); this page's
`loadPresets()` catches it, sets the signal-based `error` state, and the template maps it through Transloco
(`t('presetBrowser.' + error())`) — never an unhandled rejection. `presetBrowser.*` needs an entry per
possible rejection key plus `unknown`, same shape as `pedal.*`'s existing `midi_access_denied`/
`gp5_not_found`/`unknown` entries.

## Testing approach

- `selected-preset.service.spec.ts`: initial `selectedPreset()` is `null` (R1); `select(preset)` sets it,
  and a second `select()` call replaces the previous value (R2).
- `preset-browser-page.spec.ts` (`TestBed`, reusing `appConfig.providers`, overriding `WebMidiPedalConnection`
  with a fake exposing a controllable `connectionState` signal and a spy-able/deferred `readPresets()`,
  overriding `SelectedPresetStore` with a fake exposing a spy `select()`):
  - `isSupported()` returning `false` renders the unsupported message and `readPresets` is never called
    (R3).
  - supported but not `'connected'` renders the not-connected message and `readPresets` is never called
    (R4).
  - connected renders nothing else until `readPresets` resolves, and it is called exactly once (R5).
  - a deferred (unresolved) `readPresets()` promise renders the loading indicator (R6).
  - resolving with a fixture array of presets (deliberately out-of-slot-order, e.g. slots `[5, 1, 3]`)
    renders rows in that same array order, each showing `slot` and `name` (R7, R8).
  - a preset whose `chain` has a mix of enabled/disabled entries renders only the enabled ones'
    `moduleType`s, comma-separated, in chain order (R9); a preset whose `chain` has no enabled entries
    renders the translated empty-chain placeholder (R10).
  - rejecting `readPresets()` with `new Error('read_timeout')` renders the mapped error message and no
    `preset-row-*` elements exist (R11).
  - resolving with `[]` renders the translated "no presets found" message and no `preset-row-*` elements
    exist (R12).
  - clicking a row's `select-preset-<slot>` button calls the fake `SelectedPresetStore.select` with that
    exact preset object (R15).
- `app.routes.spec.ts` (new, plain Vitest, no `TestBed`): finds the `pedal/presets` route in `routes`,
  asserts `canActivate` equals `[authGuard]` (same guard as the `pedal` route), and awaits `loadComponent()`
  to assert the resolved class is `PresetBrowserPage` (R13).
- `pedal-connection-page.spec.ts` extended: with a fake `WebMidiPedalConnection` whose `connectionState`
  starts `'not-connected'`, `[data-testid="presets-link"]` is absent; after transitioning to `'connected'`
  (same pattern the existing "calls connect()" test already uses), the link is present with
  `routerLink`/`href` pointing at `/pedal/presets` (R14).

## Discarded alternatives

1. **Have this feature also navigate straight to a concrete `save_preset_dialog` route** (e.g.
   `routerLink="/pedal/save"`) when a preset is selected, instead of a `SelectedPresetStore` signal.
   **Rejected**: `save_preset_dialog` (feature 4) is a separate, still-`pending`/un-specced feature — its
   route doesn't exist yet. Wiring a concrete navigation target now would force this spec to either invent
   that feature's route ahead of its own design (specs should not cross-author another feature's contract)
   or leave a `routerLink` pointing at a component that doesn't exist, which breaks the build. A
   signal-based store gives `save_preset_dialog` a stable, already-tested seam to read from once its own
   page is built, without this feature guessing that page's shape — the same reasoning
   `sysex_preset_read_write/design.md` used for keeping `SysexPresetCodec` behind an interface rather than
   guessing byte-level details.
2. **Re-sort presets** (e.g. alphabetically by `name`, or by `slot` ascending) before rendering, instead of
   preserving `readPresets()`'s resolved-array order verbatim. **Rejected**: this feature's own acceptance
   criterion 1 ("Presets appear in the same order as on the pedal") and R7 both require the exact resolved
   order; `WebMidiPedalConnection.readPresets()` (`sysex_preset_read_write`'s R7/R8) already accumulates and
   resolves presets in the order their SysEx messages were received from the pedal, so re-sorting here would
   actively violate that criterion for no benefit — the pedal's own on-device ordering (by patch/bank slot)
   is exactly what the resolved array already reflects.
3. **Build a shared "unsupported/not-connected" gate component right now** instead of the inline
   `@if (!supported) / @else if (... !== 'connected') / @else` chain duplicated from `PedalConnectionPage`.
   **Rejected**: a shared, reusable component for this exact gate is explicitly the
   `unsupported_browser_fallback_ui` feature's job (still `pending`); building it ad hoc here would preempt
   that feature's own design and risk duplicate/inconsistent effort once it lands. This feature's inline
   check already satisfies `docs/architecture.md`'s hard rule ("always check `isSupported()` first ...
   instead of failing silently") the same way `PedalConnectionPage` does today.

## Out of scope

- `save_preset_dialog`'s own route, form, and backend call — a separate, still-`pending` feature; this
  feature only writes to `SelectedPresetStore` (R15).
- `import_preset_to_pedal` and `pedal_bank_selector_ui` — unrelated, separate pending features.
- A shared unsupported-browser component — `unsupported_browser_fallback_ui` feature.
- Reacting to the pedal disconnecting (`connectionState()` transitioning away from `'connected'`) while this
  page is already showing a loaded preset list — not in this feature's acceptance criteria; the existing
  `connectionState` signal is only read once, at activation (R4/R5), not subscribed to reactively thereafter.
- Sorting, filtering, search, or pagination of the preset list — the acceptance criteria only require
  preserving pedal order (R7), nothing about reorganizing or narrowing it.
- Retrying a failed `readPresets()` call automatically, or any backoff policy — same as
  `sysex_preset_read_write/design.md`'s equivalent "Out of scope" note; a user can navigate away and back to
  retry manually.
