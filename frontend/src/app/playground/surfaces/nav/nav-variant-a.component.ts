import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

// Nav variant A — "Selected-only chips".
// The full preset list is hidden by default. Only the selected presets
// show as compact chips along the top, and the board is always visible
// in the main area. To add a preset you click a "Browse…" button that
// opens a search-style picker. Concise: you only see what you're
// comparing.
@Component({
  selector: 'app-pg-nav-a',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-nav-frame">
      <div class="pg-nav-chips">
        <p class="pg-nav-h">Comparing</p>
        <div class="pg-nav-chips-row">
          @for (p of selected(); track p.slot) {
            <button type="button" class="pg-nav-chip">
              <span class="pg-nav-chip-num">{{ p.slot }}</span>
              <span class="pg-nav-chip-name">{{ p.name }}</span>
              <span class="pg-nav-chip-x" aria-hidden="true">×</span>
            </button>
          }
          <button type="button" class="pg-nav-chip pg-nav-chip--add">
            <span aria-hidden="true">+</span>
            <span>Browse presets</span>
          </button>
        </div>
      </div>
      <div class="pg-nav-board">
        <p class="pg-nav-board-h">Active board</p>
        <div class="pg-nav-board-grid">
          @for (cell of boardCells; track $index) {
            <div class="pg-nav-board-cell" [style.background]="cell.bg">
              <span class="pg-nav-board-letter">{{ cell.label }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .pg-nav-frame {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 0.625rem;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }
      .pg-nav-h {
        margin: 0 0 0.375rem;
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
        font-weight: 500;
      }
      .pg-nav-chips-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
      }
      .pg-nav-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.4375rem;
        background: #fafafa;
        border: 1px solid #e5e5e5;
        border-radius: 999px;
        padding: 0.3125rem 0.75rem;
        font-size: 0.75rem;
        color: #171717;
      }
      .pg-nav-chip-num {
        font-family: ui-monospace, monospace;
        font-size: 0.6875rem;
        color: #737373;
      }
      .pg-nav-chip-name {
        font-weight: 500;
      }
      .pg-nav-chip-x {
        margin-left: 0.125rem;
        color: #a3a3a3;
        font-size: 0.875rem;
      }
      .pg-nav-chip--add {
        background: transparent;
        border-style: dashed;
        color: #737373;
      }
      .pg-nav-board {
        background: #fafafa;
        border-radius: 6px;
        padding: 0.5rem;
      }
      .pg-nav-board-h {
        margin: 0 0 0.375rem;
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
      }
      .pg-nav-board-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
      }
      .pg-nav-board-cell {
        aspect-ratio: 1;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .pg-nav-board-letter {
        color: #fafafa;
        font-weight: 700;
        font-size: 0.6875rem;
      }
    `,
  ],
})
export class PgNavVariantA {
  protected readonly selected = signal([
    { slot: 0, name: 'Plaza Clean' },
    { slot: 1, name: 'Crunch Deluxe' },
  ]).asReadonly();

  protected readonly boardCells = [
    { label: 'EQ', bg: '#fde047' },
    { label: 'P', bg: '#fef08a' },
    { label: 'M', bg: '#a78bfa' },
    { label: 'A', bg: '#fbbf24' },
    { label: 'C', bg: '#a8a29e' },
    { label: 'EQ', bg: '#fde047' },
    { label: 'P', bg: '#fef08a' },
    { label: 'A', bg: '#fbbf24' },
    { label: 'C', bg: '#a8a29e' },
    { label: 'R', bg: '#1e40af' },
  ];
}