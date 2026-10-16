import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chain-strip variant C — "Color band + symbol".
// A horizontal color stripe with a single uppercase letter in a heavy
// display weight. No box, no shadow — just a flat band that reads like
// a vintage radio dial indicator. The category letter (E, P, A, C, R...)
// is the only visual symbol; the color carries the category.
@Component({
  selector: 'app-pg-strip-c',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-strip">
      @for (b of blocks; track b.letter) {
        <span class="pg-strip-cell" [style.background]="b.bg" [style.color]="b.fg" [class.pg-strip-cell--off]="b.off">
          <span class="pg-strip-letter">{{ b.letter }}</span>
        </span>
      }
    </div>
  `,
  styles: [
    `
      .pg-strip {
        display: flex;
        gap: 2px;
        width: 100%;
        padding: 0;
        border-radius: 4px;
        overflow: hidden;
      }
      .pg-strip-cell {
        flex: 1 1 0;
        min-width: 0;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: filter 120ms ease;
      }
      .pg-strip-cell--off {
        opacity: 0.35;
        filter: saturate(0.4);
      }
      .pg-strip-letter {
        font-family: 'Times New Roman', Georgia, serif;
        font-weight: 700;
        font-size: 0.875rem;
        letter-spacing: 0;
        line-height: 1;
      }
    `,
  ],
})
export class PgChainStripVariantC {
  // Letter chosen as the first letter of the category code. Colors are
  // the F14/F17 category palette. Foreground picked for AA contrast on
  // each background.
  protected readonly blocks = [
    { letter: 'E', bg: '#fde68a', fg: '#422006', off: false }, // EQ
    { letter: 'P', bg: '#fef08a', fg: '#422006', off: false }, // PRE
    { letter: 'D', bg: '#86efac', fg: '#052e16', off: false }, // DST
    { letter: 'A', bg: '#fdba74', fg: '#431407', off: false }, // AMP
    { letter: 'C', bg: '#a8a29e', fg: '#fafafa', off: false }, // CAB
    { letter: 'R', bg: '#bfdbfe', fg: '#1e3a8a', off: true }, // RVB
  ];
}