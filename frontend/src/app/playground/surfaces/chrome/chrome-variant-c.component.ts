import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chrome variant C — "Floating dev drawer".
// The mock data control is a tiny "DEV" tag in the corner of the page
// that opens a slide-out drawer on the right with the mock loading
// options. Production chrome looks completely clean — the dev affordance
// only appears to people who know to look for it.
@Component({
  selector: 'app-pg-chrome-c',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-ch-frame">
      <div class="pg-ch-toolbar">
        <p class="pg-ch-title">GP-5 Library</p>
        <div class="pg-ch-controls">
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
        <div class="pg-ch-drawer pg-ch-drawer--minimal">
          <span class="pg-ch-drawer-label">Drawer (no border, no padding)</span>
        </div>
        <button type="button" class="pg-ch-tab pg-ch-tab--minimal" aria-label="Toggle drawer">
          <svg viewBox="0 0 24 24" class="pg-ch-tab-ic" aria-hidden="true">
            <path d="M 9 6 L 15 12 L 9 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="pg-ch-devtag" aria-label="Open dev tools">
          DEV
        </button>
        <div class="pg-ch-devpanel" aria-label="Dev panel">
          <p class="pg-ch-devpanel-h">Developer</p>
          <button type="button" class="pg-ch-devpanel-btn">Load test presets</button>
          <button type="button" class="pg-ch-devpanel-btn">Reset stores</button>
        </div>
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
        gap: 0.25rem;
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
        background: #fff;
        min-height: 9rem;
      }
      .pg-ch-drawer {
        background: #fff;
        padding: 0.75rem;
        width: 100%;
      }
      .pg-ch-drawer--minimal {
        background: transparent;
        padding: 0;
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
        width: 1rem;
        height: 2rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #737373;
        cursor: pointer;
      }
      .pg-ch-tab--minimal {
        background: transparent;
        color: #a3a3a3;
        width: 1.25rem;
        height: 2.25rem;
      }
      .pg-ch-tab-ic {
        width: 0.875rem;
        height: 0.875rem;
      }
      .pg-ch-devtag {
        position: absolute;
        right: 0;
        top: 0;
        background: #171717;
        color: #fafafa;
        border: 0;
        border-radius: 0 0 0 4px;
        padding: 0.125rem 0.4375rem;
        font-size: 0.625rem;
        letter-spacing: 0.12em;
        font-weight: 600;
        cursor: pointer;
      }
      .pg-ch-devpanel {
        position: absolute;
        right: 0;
        top: 1.5rem;
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 6px;
        padding: 0.5rem;
        width: 11rem;
        box-shadow: 0 6px 16px -8px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .pg-ch-devpanel-h {
        margin: 0 0 0.25rem 0;
        font-size: 0.625rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #a3a3a3;
      }
      .pg-ch-devpanel-btn {
        background: transparent;
        border: 0;
        padding: 0.4375rem 0.5rem;
        font-size: 0.75rem;
        color: #404040;
        cursor: pointer;
        text-align: left;
        border-radius: 4px;
      }
      .pg-ch-devpanel-btn:hover {
        background: #f5f5f5;
      }
    `,
  ],
})
export class PgChromeVariantC {}