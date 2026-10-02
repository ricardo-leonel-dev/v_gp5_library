import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chassis variant C — "Minimal monochrome outline".
// Outline-only silhouettes in 1.5px stroke with no fills (or a barely-
// there tint). Reads as technical drawing / editorial icon: Apple-meets-
// Teenage-Engineering. Every chassis is recognizable from its outline
// alone — the silhouette carries the meaning, color is incidental.
@Component({
  selector: 'app-pg-chassis-c',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-chassis-grid">
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">AMP</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="AMP chassis variant C">
          <!-- Tolex outline -->
          <rect x="4" y="10" width="112" height="68" rx="6" fill="none" stroke="#262626" stroke-width="1.5" />
          <!-- Faceplate inset -->
          <rect x="8" y="14" width="104" height="60" rx="3" fill="none" stroke="#404040" stroke-width="1" />
          <!-- Handle -->
          <path d="M 50 10 V 6 a 4 4 0 0 1 4 -4 h 12 a 4 4 0 0 1 4 4 V 10" fill="none" stroke="#262626" stroke-width="1.5" stroke-linecap="round" />
          <!-- Grille as parallel lines -->
          <g stroke="#404040" stroke-width="0.8">
            <line x1="14" y1="26" x2="106" y2="26" />
            <line x1="14" y1="32" x2="106" y2="32" />
            <line x1="14" y1="38" x2="106" y2="38" />
            <line x1="14" y1="44" x2="106" y2="44" />
            <line x1="14" y1="50" x2="106" y2="50" />
            <line x1="14" y1="56" x2="106" y2="56" />
            <line x1="14" y1="62" x2="106" y2="62" />
          </g>
          <!-- Corner screws -->
          <g fill="none" stroke="#262626" stroke-width="0.8">
            <circle cx="12" cy="18" r="1.5" />
            <circle cx="108" cy="18" r="1.5" />
            <circle cx="12" cy="70" r="1.5" />
            <circle cx="108" cy="70" r="1.5" />
          </g>
          <!-- Single LED accent -->
          <circle cx="60" cy="16" r="1.4" fill="#262626" />
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">CAB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="CAB chassis variant C">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="none" stroke="#262626" stroke-width="1.5" />
          <rect x="8" y="8" width="104" height="68" rx="3" fill="none" stroke="#404040" stroke-width="1" />
          <!-- Speaker ring + cone -->
          <circle cx="60" cy="42" r="28" fill="none" stroke="#262626" stroke-width="1.5" />
          <circle cx="60" cy="42" r="22" fill="none" stroke="#404040" stroke-width="1" />
          <circle cx="60" cy="42" r="6" fill="none" stroke="#262626" stroke-width="1" />
          <!-- Screws -->
          <g fill="none" stroke="#262626" stroke-width="0.8">
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="108" cy="12" r="1.5" />
            <circle cx="12" cy="72" r="1.5" />
            <circle cx="108" cy="72" r="1.5" />
          </g>
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">EQ</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="EQ chassis variant C">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="none" stroke="#262626" stroke-width="1.5" />
          <!-- 4 vertical fader tracks -->
          <g fill="none" stroke="#404040" stroke-width="1">
            <line x1="26" y1="14" x2="26" y2="70" />
            <line x1="46" y1="14" x2="46" y2="70" />
            <line x1="66" y1="14" x2="66" y2="70" />
            <line x1="86" y1="14" x2="86" y2="70" />
          </g>
          <!-- Fader thumbs -->
          <g fill="none" stroke="#262626" stroke-width="1.5">
            <rect x="22" y="22" width="8" height="6" rx="1" />
            <rect x="42" y="44" width="8" height="6" rx="1" />
            <rect x="62" y="28" width="8" height="6" rx="1" />
            <rect x="82" y="56" width="8" height="6" rx="1" />
          </g>
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">RVB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="RVB chassis variant C">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="none" stroke="#262626" stroke-width="1.5" />
          <!-- 2×2 knob outlines -->
          <g fill="none" stroke="#262626" stroke-width="1.2">
            <circle cx="38" cy="30" r="10" />
            <circle cx="82" cy="30" r="10" />
            <circle cx="38" cy="58" r="10" />
            <circle cx="82" cy="58" r="10" />
          </g>
          <!-- Indicator lines -->
          <g stroke="#262626" stroke-width="1.5" stroke-linecap="round">
            <line x1="38" y1="30" x2="38" y2="22" />
            <line x1="82" y1="30" x2="86" y2="34" />
            <line x1="38" y1="58" x2="34" y2="54" />
            <line x1="82" y1="58" x2="86" y2="62" />
          </g>
        </svg>
      </figure>
    </div>
  `,
  styles: [
    `
      .pg-chassis-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }
      .pg-chassis-card {
        margin: 0;
        padding: 0.5rem 0.5rem 0.25rem;
        background: #fafafa;
        border: 1px solid #e5e5e5;
        border-radius: 6px;
      }
      .pg-chassis-label {
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #737373;
        margin-bottom: 0.25rem;
      }
      .pg-chassis-svg {
        width: 100%;
        height: auto;
        display: block;
      }
    `,
  ],
})
export class PgChassisVariantC {}