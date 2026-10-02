import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

// Nav variant B — "Full list with inline expand".
// The whole preset list is always visible. Each row shows name + a
// short preview strip. Clicking the row toggles inline expansion of the
// board below. The current v5 model, but tightened: no chrome around
// the toggle, no big indigo button — just a quiet row-level reveal.
@Component({
  selector: 'app-pg-nav-b',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-nav-frame">
      <p class="pg-nav-h">Presets</p>
      <ul class="pg-nav-list">
        @for (p of presets(); track p.slot) {
          <li class="pg-nav-row" [class.pg-nav-row--active]="p.slot === 0">
            <button type="button" class="pg-nav-row-btn" (click)="toggle(p.slot)">
              <svg viewBox="0 0 24 24" class="pg-nav-row-chev" aria-hidden="true">
                <path d="M 9 6 L 15 12 L 9 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [attr.transform]="expanded() === p.slot ? 'rotate(90 12 12)' : ''" />
              </svg>
              <span class="pg-nav-row-num">{{ p.slot }}</span>
              <span class="pg-nav-row-name">{{ p.name }}</span>
              <span class="pg-nav-row-len">{{ p.len }} blocks</span>
            </button>
            @if (expanded() === p.slot) {
              <div class="pg-nav-row-expand">
                <div class="pg-nav-row-strip">
                  @for (b of p.preview; track $index) {
                    <span class="pg-nav-row-strip-cell" [style.background]="b"></span>
                  }
                </div>
              </div>
            }
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      .pg-nav-frame {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 0.5rem;
      }
      .pg-nav-h {
        margin: 0 0 0.375rem;
        padding: 0 0.375rem;
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
        font-weight: 500;
      }
      .pg-nav-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .pg-nav-row {
        border-radius: 4px;
      }
      .pg-nav-row--active {
        background: #fafafa;
      }
      .pg-nav-row-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        background: transparent;
        border: 0;
        padding: 0.4375rem 0.5rem;
        font-size: 0.75rem;
        color: #404040;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
      }
      .pg-nav-row-btn:hover {
        background: #f5f5f5;
      }
      .pg-nav-row-chev {
        width: 0.875rem;
        height: 0.875rem;
        color: #a3a3a3;
        flex-shrink: 0;
        transition: transform 120ms ease;
      }
      .pg-nav-row-num {
        font-family: ui-monospace, monospace;
        font-size: 0.6875rem;
        color: #737373;
        width: 1.5rem;
      }
      .pg-nav-row-name {
        flex: 1;
        color: #171717;
        font-weight: 500;
      }
      .pg-nav-row-len {
        font-size: 0.625rem;
        color: #a3a3a3;
      }
      .pg-nav-row-expand {
        padding: 0.25rem 0.5rem 0.5rem 2rem;
      }
      .pg-nav-row-strip {
        display: flex;
        gap: 2px;
      }
      .pg-nav-row-strip-cell {
        flex: 1;
        height: 12px;
        border-radius: 2px;
      }
    `,
  ],
})
export class PgNavVariantB {
  protected readonly expanded = signal<number | null>(0);

  protected readonly presets = signal([
    {
      slot: 0,
      name: 'Plaza Clean',
      len: 4,
      preview: ['#fde047', '#fef08a', '#a78bfa', '#fbbf24', '#a8a29e'],
    },
    {
      slot: 1,
      name: 'Crunch Deluxe',
      len: 8,
      preview: ['#fde047', '#fef08a', '#86efac', '#fbbf24', '#a8a29e', '#a78bfa', '#7dd3fc', '#1e40af'],
    },
    {
      slot: 2,
      name: 'Saturated Snap',
      len: 6,
      preview: ['#67e8f9', '#fef08a', '#86efac', '#fb7185', '#fbbf24', '#7dd3fc'],
    },
    {
      slot: 3,
      name: 'Wet Lead',
      len: 7,
      preview: ['#fde047', '#86efac', '#a78bfa', '#fbbf24', '#a8a29e', '#7dd3fc', '#1e40af'],
    },
    {
      slot: 4,
      name: 'Ambient Wash',
      len: 6,
      preview: ['#fde047', '#fef08a', '#a78bfa', '#fbbf24', '#a8a29e', '#1e40af'],
    },
  ]).asReadonly();

  toggle(slot: number): void {
    this.expanded.update((cur) => (cur === slot ? null : slot));
  }
}