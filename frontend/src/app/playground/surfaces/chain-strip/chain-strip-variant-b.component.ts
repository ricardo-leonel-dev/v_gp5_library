import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chain-strip variant B — "Bold iconic glyph only".
// Each block is the existing pedal-glyph at a much bigger size, no
// background pill, no 3-letter code. The block's category color becomes
// the icon color, not the background. Reads like a sequencer icon row.
@Component({
  selector: 'app-pg-strip-b',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-strip">
      @for (b of blocks; track b.code) {
        <span class="pg-strip-cell" [class.pg-strip-cell--off]="b.off">
          <svg viewBox="0 0 16 16" [attr.aria-label]="b.code" fill="none" [attr.stroke]="b.color" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path [attr.d]="b.path" />
          </svg>
        </span>
      }
    </div>
  `,
  styles: [
    `
      .pg-strip {
        display: flex;
        gap: 0;
        width: 100%;
        background: #fafafa;
        border-radius: 6px;
        padding: 0.5rem 0.25rem;
      }
      .pg-strip-cell {
        flex: 1 1 0;
        min-width: 0;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .pg-strip-cell--off {
        opacity: 0.35;
      }
      .pg-strip-cell svg {
        width: 70%;
        height: 70%;
        display: block;
      }
    `,
  ],
})
export class PgChainStripVariantB {
  // Path data mirrors `PEDAL_GLYPHS` from the production code so this
  // variant reads as the same icon family scaled up. Colors come from
  // the F14/F17 category palette.
  protected readonly blocks = [
    { code: 'EQ', path: 'M4 2v12M8 2v12M12 2v12M2.5 10h3M6.5 5h3M10.5 8h3', color: '#0a0a0a', off: false },
    { code: 'PRE', path: 'M1 8h4M3 6l2 2-2 2M15 8h-4M13 6l-2 2 2 2M8 3v10', color: '#a16207', off: false },
    { code: 'DST', path: 'M1 11V5h4v6h4V5h4v6h2', color: '#15803d', off: false },
    { code: 'AMP', path: 'M3 4h10v8H3zM5 6h6M5 8h6M5 10h6', color: '#b45309', off: false },
    { code: 'CAB', path: 'M3 8a5 5 0 1 0 10 0a5 5 0 1 0-10 0M6.5 8a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', color: '#57534e', off: false },
    { code: 'RVB', path: 'M3 13a5 5 0 0 1 10 0M1 13a7 7 0 0 1 14 0M5 13a3 3 0 0 1 6 0', color: '#1e3a8a', off: true },
  ] as const;
}