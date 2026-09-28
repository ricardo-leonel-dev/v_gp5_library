import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { Preset } from '../../midi/preset';
import { WebMidiPedalConnection } from '../../midi/web-midi-pedal-connection';
import { SelectedPresetStore } from '../selected-preset.service';
import { ChainStrip } from '../chain-strip/chain-strip';
import { ChainBoard } from '../chain-board/chain-board';
import { BlockDetail } from '../block-detail/block-detail';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-preset-browser-page',
  imports: [TranslocoDirective, ChainStrip, ChainBoard, BlockDetail],
  templateUrl: './preset-browser-page.html',
})
export class PresetBrowserPage implements OnInit, AfterViewInit {
  private readonly pedal = inject(WebMidiPedalConnection);
  private readonly selectedPresetStore = inject(SelectedPresetStore);

  readonly supported = this.pedal.isSupported();
  readonly connectionState = this.pedal.connectionState;
  readonly loadState = signal<LoadState>('idle');
  readonly presets = signal<Preset[]>([]);
  readonly error = signal<string | null>(null);
  readonly selectedPreset = this.selectedPresetStore.selectedPreset;
  readonly selectedBlockIndex = signal<number | null>(null);

  private readonly boardSection = viewChild<ElementRef<HTMLElement>>('boardSection');

  private readonly scrollBehavior = signal<'smooth' | 'auto'>('auto');

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.scrollBehavior.set(
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      );
    }

    // Reset the block detail selection whenever the parent preset changes
    // (R25). Uses an effect so it stays reactive without forcing the parent
    // row click to call a separate method.
    effect(() => {
      this.selectedPreset();
      this.selectedBlockIndex.set(null);
    });

    // Scroll the board into view after the user picks a preset, so the
    // chain stays visible even when the list is long. UX only; makes no
    // MIDI call (R37).
    effect(() => {
      const preset = this.selectedPreset();
      if (!preset) return;
      queueMicrotask(() => {
        const el = this.boardSection()?.nativeElement;
        el?.scrollIntoView?.({ block: 'start', behavior: this.scrollBehavior() });
      });
    });
  }

  ngOnInit(): void {
    if (!this.supported) return;
    if (this.connectionState() !== 'connected') return;
    void this.loadPresets();
  }

  ngAfterViewInit(): void {
    // No-op; kept for the lifecycle hook to exist if it becomes useful.
  }

  selectPreset(preset: Preset): void {
    this.selectedPresetStore.select(preset);
  }

  onBlockSelected(position: number): void {
    this.selectedBlockIndex.set(position);
  }

  private async loadPresets(): Promise<void> {
    this.loadState.set('loading');
    this.error.set(null);
    try {
      this.presets.set(await this.pedal.readPresets());
      this.loadState.set('loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      // 'not_connected' is also the guard-state key (see the template's
      // outer not-connected branch, worded as a "please connect" prompt) —
      // map it to the distinct 'not_connected_error' key here so a
      // mid-operation disconnect renders "the pedal is not connected"
      // instead of reusing that unrelated prompt's copy.
      this.error.set(message === 'not_connected' ? 'not_connected_error' : message);
      this.loadState.set('error');
    }
  }
}