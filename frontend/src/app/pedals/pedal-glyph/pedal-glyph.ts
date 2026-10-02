import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PEDAL_GLYPHS } from '../pedal-glyphs';

@Component({
  selector: 'app-pedal-glyph',
  templateUrl: './pedal-glyph.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `display: contents` so the host element does not affect the flex/grid
  // layout of its parent block. The glyph is meant to be one of several
  // children of a stompbox.
  host: { class: 'contents' },
})
export class PedalGlyph {
  readonly categoryIndex = input.required<number>();
  readonly svgClass = input<string>('size-4');

  readonly glyph = computed(() => PEDAL_GLYPHS[this.categoryIndex()] ?? null);
}