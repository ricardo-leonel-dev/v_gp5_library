import { ChangeDetectionStrategy, Component } from '@angular/core';

// Block-detail variant B — "Quiet badge in header".
// The warning is reduced to a tiny `i` icon pill next to the title.
// Hovering reveals a tooltip with the long-form note. Sits inline with
// the FX title — no border, no callout box, no screaming color.
@Component({
  selector: 'app-pg-block-detail-b',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pg-bd-card" aria-label="Block detail variant B">
      <header class="pg-bd-head">
        <div class="pg-bd-meta">
          <span class="pg-bd-chip pg-bd-chip--amp" aria-hidden="true">AMP</span>
          <div class="pg-bd-titles">
            <p class="pg-bd-title">
              US Clean
              <span class="pg-bd-pill" tabindex="0" aria-describedby="pg-bd-tip-b">
                <svg viewBox="0 0 12 12" class="pg-bd-pill-ic" aria-hidden="true">
                  <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1" />
                  <circle cx="6" cy="4" r="0.6" fill="currentColor" />
                  <path d="M 6 6 V 9" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
                </svg>
                <span class="pg-bd-pill-label">unverified</span>
              </span>
            </p>
            <p class="pg-bd-cat">Amplifier</p>
          </div>
        </div>
        <button type="button" class="pg-bd-close" aria-label="Close detail">×</button>
      </header>
      <span id="pg-bd-tip-b" role="tooltip" class="pg-bd-tip">
        Manual page numbers are an assumption based on firmware behavior, not a vendor-published mapping.
      </span>
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
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        flex-wrap: wrap;
      }
      .pg-bd-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.125rem 0.4375rem;
        background: #f5f5f5;
        color: #525252;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 500;
        cursor: help;
        position: relative;
      }
      .pg-bd-pill:focus {
        outline: 2px solid #525252;
        outline-offset: 1px;
      }
      .pg-bd-pill-ic {
        width: 0.75rem;
        height: 0.75rem;
      }
      .pg-bd-tip {
        position: relative;
        display: block;
        margin: 0.5rem 0 0;
        max-width: 0;
        max-height: 0;
        opacity: 0;
        pointer-events: none;
        background: #262626;
        color: #fafafa;
        font-size: 0.6875rem;
        padding: 0;
        border-radius: 4px;
        overflow: hidden;
      }
      .pg-bd-pill:hover + .pg-bd-tip,
      .pg-bd-pill:focus + .pg-bd-tip {
        max-width: 24rem;
        max-height: 6rem;
        opacity: 1;
        padding: 0.4375rem 0.625rem;
        pointer-events: auto;
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
export class PgBlockDetailVariantB {}