import { ChangeDetectionStrategy, Component } from '@angular/core';

// Block-detail variant A — "Tooltip only".
// The "manual names unverified" warning is gone entirely. No callout,
// no footnote, no badge. The detail panel trusts the user: title,
// category, on/off state, parameters, close button. Minimal.
@Component({
  selector: 'app-pg-block-detail-a',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pg-bd-card" aria-label="Block detail variant A">
      <header class="pg-bd-head">
        <div class="pg-bd-meta">
          <span class="pg-bd-chip pg-bd-chip--amp" aria-hidden="true">AMP</span>
          <div class="pg-bd-titles">
            <p class="pg-bd-title">US Clean</p>
            <p class="pg-bd-cat">Amplifier</p>
          </div>
        </div>
        <button type="button" class="pg-bd-close" aria-label="Close detail">×</button>
      </header>
      <p class="pg-bd-state">
        <span class="pg-bd-led pg-bd-led--on" aria-hidden="true"></span>
        Enabled
      </p>
      <h3 class="pg-bd-h3">Parameters</h3>
      <dl class="pg-bd-params">
        <div>
          <dt>Gain</dt>
          <dd>6.4</dd>
        </div>
        <div>
          <dt>Bass</dt>
          <dd>5.0</dd>
        </div>
        <div>
          <dt>Mid</dt>
          <dd>4.2</dd>
        </div>
        <div>
          <dt>Treble</dt>
          <dd>7.1</dd>
        </div>
      </dl>
    </section>
  `,
  styles: [
    `
      .pg-bd-card {
        background: #fff;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 0.875rem;
      }
      .pg-bd-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .pg-bd-meta {
        display: flex;
        align-items: center;
        gap: 0.625rem;
      }
      .pg-bd-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: -0.01em;
      }
      .pg-bd-chip--amp {
        background: #f59e0b;
        color: #451a03;
      }
      .pg-bd-titles {
        line-height: 1.2;
      }
      .pg-bd-title {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: #171717;
      }
      .pg-bd-cat {
        margin: 0.125rem 0 0;
        font-size: 0.75rem;
        color: #737373;
      }
      .pg-bd-close {
        background: transparent;
        border: 0;
        padding: 0.25rem 0.5rem;
        font-size: 1.125rem;
        color: #737373;
        cursor: pointer;
      }
      .pg-bd-state {
        margin: 0.625rem 0 0;
        font-size: 0.75rem;
        color: #525252;
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      .pg-bd-led {
        display: inline-block;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
      }
      .pg-bd-led--on {
        background: #ef4444;
        box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.5);
      }
      .pg-bd-h3 {
        margin: 0.75rem 0 0.375rem;
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
        font-weight: 500;
      }
      .pg-bd-params {
        margin: 0;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.5rem 1rem;
      }
      .pg-bd-params > div {
        display: flex;
        flex-direction: column;
      }
      .pg-bd-params dt {
        font-size: 0.625rem;
        color: #737373;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .pg-bd-params dd {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: #171717;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class PgBlockDetailVariantA {}