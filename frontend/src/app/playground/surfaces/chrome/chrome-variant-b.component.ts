import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chrome variant B — "Outlined dev button, smaller".
// The mock data button is an outlined button at xs size, sitting in the
// toolbar. Quieter than the indigo filled button (v5's "horrible"
// treatment) but still clearly a clickable button. Right-aligned with the
// lang/theme cluster.
@Component({
  selector: 'app-pg-chrome-b',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-ch-frame">
      <div class="pg-ch-toolbar">
        <p class="pg-ch-title">GP-5 Library</p>
        <div class="pg-ch-controls">
          <button type="button" class="pg-ch-dev" aria-label="Load test presets">
            <svg viewBox="0 0 16 16" class="pg-ch-dev-ic" aria-hidden="true">
              <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4" />
              <path d="M 5 7 H 11 M 5 10 H 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span>Mock data</span>
          </button>
          <span class="pg-ch-sep" aria-hidden="true"></span>
          <button type="button" class="pg-ch-lang" aria-label="Switch language">
            <span class="pg-ch-lang-active">ES</span>
            <span class="pg-ch-lang-inactive">EN</span>
          </button>
          <button type="button" class="pg-ch-theme" aria-label="Toggle theme">
            <svg viewBox="0 0 16 16" class="pg-ch-theme-ic" aria-hidden="true">
              <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4" />
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" />
            </svg>
          </button>
        </div>
      </div>
      <div class="pg-ch-page">
        <div class="pg-ch-drawer pg-ch-drawer--accented">
          <span class="pg-ch-drawer-label">Drawer</span>
        </div>
        <button type="button" class="pg-ch-tab pg-ch-tab--accented" aria-label="Toggle drawer">
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
      .pg-ch-dev {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: #fff;
        border: 1px dashed #a3a3a3;
        border-radius: 4px;
        padding: 0.25rem 0.5rem;
        font-size: 0.6875rem;
        color: #525252;
        cursor: pointer;
        font-weight: 500;
      }
      .pg-ch-dev:hover {
        background: #f5f5f5;
        color: #171717;
      }
      .pg-ch-dev-ic {
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
      .pg-ch-drawer--accented {
        border-top: 2px solid #171717;
        background: linear-gradient(180deg, #fafafa 0%, #fff 40%);
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
        background: rgba(229, 229, 229, 0.7);
        border: 0;
        border-radius: 0 4px 4px 0;
        width: 1.5rem;
        height: 2.75rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #525252;
        cursor: pointer;
      }
      .pg-ch-tab--accented {
        background: #171717;
        color: #fafafa;
      }
      .pg-ch-tab-ic {
        width: 0.875rem;
        height: 0.875rem;
      }
    `,
  ],
})
export class PgChromeVariantB {}