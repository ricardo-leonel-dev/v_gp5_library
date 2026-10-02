import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chain-strip variant A — "Mini chassis silhouette".
// Each block is rendered as a tiny chassis at 1/4 scale: real knobs, real
// sliders, real grille — recognizable as the same hardware as the board
// blocks. No 3-letter code, no colored pill. Reads as a hardware strip.
@Component({
  selector: 'app-pg-strip-a',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-strip">
      @for (b of blocks; track b.kind) {
        <span class="pg-strip-cell" [class.pg-strip-cell--off]="b.off">
          @switch (b.kind) {
            @case ('amp') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="3" width="30" height="20" rx="2" fill="#fcd34d" stroke="#1a1a1a" stroke-width="1" />
                <g stroke="#1a1a1a" stroke-width="0.6">
                  <line x1="4" y1="9" x2="28" y2="9" />
                  <line x1="4" y1="13" x2="28" y2="13" />
                  <line x1="4" y1="17" x2="28" y2="17" />
                </g>
                <circle cx="16" cy="5" r="0.7" fill="#ef4444" />
              </svg>
            }
            @case ('cab') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="2" width="30" height="20" rx="2" fill="#1e40af" stroke="#0a0a0a" stroke-width="1" />
                <circle cx="16" cy="12" r="7" fill="#fff" stroke="#0a0a0a" stroke-width="1" />
                <circle cx="16" cy="12" r="5" fill="#1e3a8a" stroke="#0a0a0a" stroke-width="0.5" />
                <circle cx="16" cy="12" r="1.6" fill="#0a0a0a" />
              </svg>
            }
            @case ('eq') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="2" width="30" height="20" rx="2" fill="#10b981" stroke="#0a0a0a" stroke-width="1" />
                <g fill="#fff" stroke="#0a0a0a" stroke-width="0.6">
                  <rect x="6" y="6" width="2" height="12" rx="1" />
                  <rect x="12" y="6" width="2" height="12" rx="1" />
                  <rect x="18" y="6" width="2" height="12" rx="1" />
                  <rect x="24" y="6" width="2" height="12" rx="1" />
                </g>
                <g fill="#0a0a0a">
                  <rect x="5" y="9" width="4" height="2" rx="0.4" />
                  <rect x="11" y="14" width="4" height="2" rx="0.4" />
                  <rect x="17" y="11" width="4" height="2" rx="0.4" />
                  <rect x="23" y="16" width="4" height="2" rx="0.4" />
                </g>
              </svg>
            }
            @case ('rvb') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="2" width="30" height="20" rx="2" fill="#7c3aed" stroke="#0a0a0a" stroke-width="1" />
                <g fill="#fbbf24" stroke="#0a0a0a" stroke-width="0.7">
                  <circle cx="10" cy="8" r="3" />
                  <circle cx="22" cy="8" r="3" />
                  <circle cx="10" cy="16" r="3" />
                  <circle cx="22" cy="16" r="3" />
                </g>
                <g stroke="#0a0a0a" stroke-width="0.7" stroke-linecap="round">
                  <line x1="10" y1="8" x2="10" y2="6" />
                  <line x1="22" y1="8" x2="23.5" y2="9.5" />
                  <line x1="10" y1="16" x2="8.5" y2="14.5" />
                  <line x1="22" y1="16" x2="23.5" y2="17.5" />
                </g>
              </svg>
            }
            @case ('stomp') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="2" width="30" height="20" rx="3" fill="#dc2626" stroke="#0a0a0a" stroke-width="1" />
                <g fill="#0a0a0a">
                  <circle cx="10" cy="12" r="1.6" />
                  <circle cx="16" cy="12" r="1.6" />
                  <circle cx="22" cy="12" r="1.6" />
                </g>
              </svg>
            }
            @case ('unknown') {
              <svg viewBox="0 0 32 24" aria-hidden="true">
                <rect x="1" y="2" width="30" height="20" rx="3" fill="none" stroke="#a3a3a3" stroke-width="1" stroke-dasharray="2 2" />
              </svg>
            }
          }
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
      }
      .pg-strip-cell {
        flex: 1 1 0;
        min-width: 0;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: #fff;
        box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.15);
      }
      .pg-strip-cell--off {
        opacity: 0.4;
      }
      .pg-strip-cell svg {
        width: 100%;
        max-width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class PgChainStripVariantA {
  protected readonly blocks: ReadonlyArray<{
    kind: 'amp' | 'cab' | 'eq' | 'rvb' | 'stomp' | 'unknown';
    off: boolean;
  }> = [
    { kind: 'eq', off: false },
    { kind: 'stomp', off: false },
    { kind: 'stomp', off: false },
    { kind: 'amp', off: false },
    { kind: 'cab', off: false },
    { kind: 'rvb', off: true },
    { kind: 'unknown', off: false },
  ];
}