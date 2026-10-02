import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chrome variant A — "Ghost link with icon".
// The "Load test presets" mock button is reduced to a text link with a
// small download/play glyph, sitting next to the language switcher.
// Reads as a developer escape hatch, not a primary action.
@Component({
  selector: 'app-pg-chrome-a',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-ch-frame">
      <div class="pg-ch-toolbar">
        <p class="pg-ch-title">GP-5 Library</p>
        <div class="pg-ch-controls">
          <button type="button" class="pg-ch-link" aria-label="Load test presets">
            <svg viewBox="0 0 16 16" class="pg-ch-link-ic" aria-hidden="true">
              <path d="M 8 2 V 10 M 4 7 L 8 11 L 12 7 M 2 13 H 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span>Load test presets</span>
          </button>
          <span class="pg-ch-sep" aria-hidden="true"></span>
          <button type="button" class="pg-ch-lang" aria-label="Switch language">
            <span class="pg-ch-lang-active">ES</span>
            <span class="pg-ch-lang-inactive">EN</span>
          </button>
          <button type="button" class="pg-ch-theme" aria-label="Toggle theme">
            <svg viewBox="0 0 16 16" class="pg-ch-theme-ic" aria-hidden="true">
              <path d="M 13 9 A 6 6 0 1 1 7 3 a 5 5 0 0 0 6 6 z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      <div class="pg-ch-page">
        <div class="pg-ch-drawer">
          <span class="pg-ch-drawer-label">Drawer</span>
        </div>
        <button type="button" class="pg-ch-tab" aria-label="Toggle drawer">
          <svg viewBox="0 0 24 24" class="pg-ch-tab-ic" aria-hidden="true">
            <path d="M 9 6 L 15 12 L 9 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .pg-ch-frame {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        overflow: hidden;
      }
      .pg-ch-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.625rem 0.875rem;
        border-bottom: 1px solid #f5f5f5;
      }
      .pg-ch-title {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: #171717;
        letter-spacing: -0.01em;
      }
      .pg-ch-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .pg-ch-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: transparent;
        border: 0;
        padding: 0.25rem 0.375rem;
        font-size: 0.75rem;
        color: #737373;
        cursor: pointer;
      }
      .pg-ch-link:hover {
        color: #171717;
      }
      .pg-ch-link-ic {
        width: 0.875rem;
        height: 0.875rem;
      }
      .pg-ch-sep {
        width: 1px;
        height: 0.875rem;
        background: #e5e5e5;
      }
      .pg-ch-lang {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: transparent;
        border: 0;
        padding: 0.25rem 0.375rem;
        font-size: 0.6875rem;
        letter-spacing: 0.06em;
        cursor: pointer;
      }
      .pg-ch-lang-active {
        color: #171717;
        font-weight: 600;
      }
      .pg-ch-lang-inactive {
        color: #a3a3a3;
      }
      .pg-ch-theme {
        background: transparent;
        border: 0;
        padding: 0.25rem;
        color: #737373;
        cursor: pointer;
        display: inline-flex;
      }
      .pg-ch-theme-ic {
        width: 0.875rem;
        height: 0.875rem;
      }
      .pg-ch-page {
        position: relative;
        background: #fafafa;
        min-height: 7rem;
      }
      .pg-ch-drawer {
        background: #fff;
        border-right: 1px solid #f5f5f5;
        padding: 0.75rem;
        width: 100%;
      }
      .pg-ch-drawer-label {
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #a3a3a3;
      }
      .pg-ch-tab {
        position: absolute;
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(229, 229, 229, 0.6);
        border: 0;
        border-radius: 0 4px 4px 0;
        width: 1.25rem;
        height: 2.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #737373;
        cursor: pointer;
      }
      .pg-ch-tab-ic {
        width: 0.875rem;
        height: 0.875rem;
      }
    `,
  ],
})
export class PgChromeVariantA {}