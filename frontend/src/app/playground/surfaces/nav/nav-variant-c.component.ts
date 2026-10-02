import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

// Nav variant C — "Sticky toolbar + popup".
// A persistent vertical strip on the left lists every preset as a
// numbered icon (1–10 in three rows of three). Clicking opens a
// popover-style card to the right with the preset's chain board. Saves
// horizontal space; the main area is always 100% board width.
@Component({
  selector: 'app-pg-nav-c',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-nav-frame">
      <aside class="pg-nav-strip" aria-label="Preset strip">
        <p class="pg-nav-h">Presets</p>
        <div class="pg-nav-grid">
          @for (p of presets; track p.slot) {
            <button
              type="button"
              class="pg-nav-tile"
              [class.pg-nav-tile--active]="active() === p.slot"
              (click)="setActive(p.slot)"
              [attr.aria-label]="'Preset ' + p.slot + ' ' + p.name"
            >
              <span class="pg-nav-tile-num">{{ p.slot }}</span>
              <span class="pg-nav-tile-name">{{ p.name }}</span>
            </button>
          }
        </div>
      </aside>
      <section class="pg-nav-main">
        <p class="pg-nav-h">{{ activeName() }}</p>
        <div class="pg-nav-board-grid">
          @for (cell of currentBoard; track $index) {
            <div class="pg-nav-board-cell" [style.background]="cell.bg">
              <span class="pg-nav-board-letter">{{ cell.label }}</span>
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .pg-nav-frame {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        display: grid;
        grid-template-columns: 5rem 1fr;
        min-height: 9rem;
      }
      .pg-nav-strip {
        border-right: 1px solid #f5f5f5;
        padding: 0.5rem 0.375rem;
      }
      .pg-nav-h {
        margin: 0 0 0.375rem;
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
        font-weight: 500;
      }
      .pg-nav-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.25rem;
      }
      .pg-nav-tile {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.0625rem;
        background: transparent;
        border: 0;
        padding: 0.3125rem 0.4375rem;
        border-radius: 4px;
        cursor: pointer;
        text-align: left;
      }
      .pg-nav-tile:hover {
        background: #f5f5f5;
      }
      .pg-nav-tile--active {
        background: #171717;
        color: #fafafa;
      }
      .pg-nav-tile-num {
        font-family: ui-monospace, monospace;
        font-size: 0.6875rem;
        color: inherit;
        opacity: 0.6;
      }
      .pg-nav-tile-name {
        font-size: 0.6875rem;
        font-weight: 500;
        line-height: 1.2;
      }
      .pg-nav-main {
        padding: 0.5rem;
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
export class PgNavVariantC {
  protected readonly active = signal<number>(0);
  protected readonly activeName = signal<string>('Plaza Clean');

  protected readonly presets = [
    { slot: 0, name: 'Plaza Clean' },
    { slot: 1, name: 'Crunch Deluxe' },
    { slot: 2, name: 'Saturated Snap' },
    { slot: 3, name: 'Wet Lead' },
    { slot: 4, name: 'Ambient Wash' },
    { slot: 5, name: 'Empty Slot' },
  ];

  protected readonly currentBoard = [
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

  setActive(slot: number): void {
    this.active.set(slot);
    const p = this.presets.find((x) => x.slot === slot);
    this.activeName.set(p?.name ?? '');
  }
}