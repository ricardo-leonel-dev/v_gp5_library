import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chassis variant B — "Vector icon set".
// A coherent illustration system: flat fills, bold black outlines, a
// single accent color per chassis (yellow for amp, blue for cab, etc.).
// The visual language is closer to a product illustrator's icon family
// than to a photograph — every chassis is recognizable at thumbnail size
// because the silhouette carries the meaning.
@Component({
  selector: 'app-pg-chassis-b',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-chassis-grid">
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">AMP</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="AMP chassis variant B">
          <!-- Body: rounded rectangle, flat fill, bold outline -->
          <rect x="4" y="10" width="112" height="68" rx="6" fill="#fcd34d" stroke="#1a1a1a" stroke-width="2.5" />
          <!-- Grille: hatch pattern (thick strokes, no fill) -->
          <g stroke="#1a1a1a" stroke-width="1.6" stroke-linecap="round">
            <line x1="14" y1="24" x2="106" y2="24" />
            <line x1="14" y1="32" x2="106" y2="32" />
            <line x1="14" y1="40" x2="106" y2="40" />
            <line x1="14" y1="48" x2="106" y2="48" />
            <line x1="14" y1="56" x2="106" y2="56" />
            <line x1="14" y1="64" x2="106" y2="64" />
          </g>
          <!-- Accent: a single red LED at top -->
          <circle cx="60" cy="14" r="2" fill="#ef4444" stroke="#1a1a1a" stroke-width="1" />
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">CAB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="CAB chassis variant B">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="#1e40af" stroke="#0a0a0a" stroke-width="2.5" />
          <!-- Big circular speaker -->
          <circle cx="60" cy="42" r="28" fill="#fff" stroke="#0a0a0a" stroke-width="2.5" />
          <circle cx="60" cy="42" r="22" fill="#1e3a8a" stroke="#0a0a0a" stroke-width="1.5" />
          <circle cx="60" cy="42" r="6" fill="#0a0a0a" />
          <!-- Corner screws as small circles -->
          <circle cx="10" cy="10" r="1.5" fill="#fcd34d" />
          <circle cx="110" cy="10" r="1.5" fill="#fcd34d" />
          <circle cx="10" cy="74" r="1.5" fill="#fcd34d" />
          <circle cx="110" cy="74" r="1.5" fill="#fcd34d" />
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">EQ</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="EQ chassis variant B">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="#10b981" stroke="#0a0a0a" stroke-width="2.5" />
          <!-- 4 vertical faders as bold capsules -->
          <g stroke="#0a0a0a" stroke-width="2" fill="#fff">
            <rect x="22" y="14" width="6" height="56" rx="3" />
            <rect x="42" y="14" width="6" height="56" rx="3" />
            <rect x="62" y="14" width="6" height="56" rx="3" />
            <rect x="82" y="14" width="6" height="56" rx="3" />
          </g>
          <!-- Fader thumbs as filled rectangles at varied heights -->
          <g fill="#0a0a0a">
            <rect x="20" y="22" width="10" height="6" rx="1" />
            <rect x="40" y="46" width="10" height="6" rx="1" />
            <rect x="60" y="30" width="10" height="6" rx="1" />
            <rect x="80" y="56" width="10" height="6" rx="1" />
          </g>
        </svg>
      </figure>

      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">RVB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="RVB chassis variant B">
          <rect x="4" y="4" width="112" height="76" rx="6" fill="#7c3aed" stroke="#0a0a0a" stroke-width="2.5" />
          <!-- 2×2 knob matrix -->
          <g fill="#fbbf24" stroke="#0a0a0a" stroke-width="2">
            <circle cx="38" cy="30" r="11" />
            <circle cx="82" cy="30" r="11" />
            <circle cx="38" cy="58" r="11" />
            <circle cx="82" cy="58" r="11" />
          </g>
          <!-- Indicator lines -->
          <g stroke="#0a0a0a" stroke-width="2" stroke-linecap="round">
            <line x1="38" y1="30" x2="38" y2="22" />
            <line x1="82" y1="30" x2="86" y2="35" />
            <line x1="38" y1="58" x2="34" y2="53" />
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
        background: #fff;
        border: 1px solid #d4d4d4;
        border-radius: 6px;
      }
      .pg-chassis-label {
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #525252;
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
export class PgChassisVariantB {}