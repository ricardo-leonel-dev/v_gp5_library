import { ChangeDetectionStrategy, Component } from '@angular/core';

// Chassis variant A — "Product photo realism".
// Inspired by the Valeton GP-5 product photos: dark tolex body, brushed
// aluminum faceplate, real screws, real carrying handle on the amp/cab,
// real grille pattern on the amp, real speaker cone on the cab, real
// vertical faders on the EQ, real 2×2 knob grid on the reverb.
//
// All SVG is drawn from scratch — no copy of any vendor path data. The
// visual language references the product family but every primitive here
// is bespoke to this playground.
@Component({
  selector: 'app-pg-chassis-a',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pg-chassis-grid">
      <!-- AMP — cabezal con rejilla + asa -->
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">AMP</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="AMP chassis variant A">
          <defs>
            <linearGradient id="pg-amp-tolex" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#1f1410" />
              <stop offset="1" stop-color="#0a0604" />
            </linearGradient>
            <linearGradient id="pg-amp-face" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#cfcfcf" />
              <stop offset="0.45" stop-color="#9a9a9a" />
              <stop offset="1" stop-color="#5d5d5d" />
            </linearGradient>
            <pattern id="pg-amp-grille" width="4" height="4" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill="#111" />
            </pattern>
          </defs>
          <!-- Tolex body -->
          <rect x="2" y="10" width="116" height="68" rx="6" fill="url(#pg-amp-tolex)" />
          <!-- Brushed faceplate -->
          <rect x="6" y="14" width="108" height="60" rx="3" fill="url(#pg-amp-face)" stroke="#3a3a3a" stroke-width="0.5" />
          <!-- Carrying handle -->
          <rect x="50" y="6" width="20" height="6" rx="2" fill="#2a2a2a" stroke="#0a0a0a" stroke-width="0.5" />
          <rect x="52" y="7" width="16" height="2" rx="1" fill="#4a4a4a" />
          <!-- Grille cloth -->
          <rect x="14" y="22" width="92" height="46" rx="2" fill="url(#pg-amp-grille)" />
          <!-- Gold piping along the seam -->
          <line x1="6" y1="14" x2="114" y2="14" stroke="#a87830" stroke-width="0.7" />
          <line x1="6" y1="74" x2="114" y2="74" stroke="#a87830" stroke-width="0.7" />
          <!-- Corner screws -->
          <circle cx="11" cy="19" r="1.5" fill="#cfa14a" />
          <circle cx="109" cy="19" r="1.5" fill="#cfa14a" />
          <circle cx="11" cy="69" r="1.5" fill="#cfa14a" />
          <circle cx="109" cy="69" r="1.5" fill="#cfa14a" />
          <!-- LED -->
          <circle cx="60" cy="16" r="1.2" fill="#ef4444" />
        </svg>
      </figure>

      <!-- CAB — gabinete con altavoz -->
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">CAB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="CAB chassis variant A">
          <defs>
            <linearGradient id="pg-cab-tolex" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#1c130d" />
              <stop offset="1" stop-color="#070403" />
            </linearGradient>
            <radialGradient id="pg-cab-cone" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="#3a3a3a" />
              <stop offset="0.6" stop-color="#0e0e0e" />
              <stop offset="1" stop-color="#000" />
            </radialGradient>
          </defs>
          <rect x="2" y="4" width="116" height="76" rx="6" fill="url(#pg-cab-tolex)" />
          <!-- Baffle panel inset -->
          <rect x="10" y="10" width="100" height="64" rx="2" fill="#1a1a1a" stroke="#3a3a3a" stroke-width="0.5" />
          <!-- Speaker ring -->
          <circle cx="60" cy="42" r="26" fill="#000" stroke="#2a2a2a" stroke-width="1" />
          <circle cx="60" cy="42" r="24" fill="url(#pg-cab-cone)" />
          <!-- Dust cap -->
          <circle cx="60" cy="42" r="7" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="0.5" />
          <!-- Cone highlight -->
          <ellipse cx="55" cy="36" rx="6" ry="3" fill="#3a3a3a" opacity="0.6" />
          <!-- Corner screws -->
          <circle cx="14" cy="14" r="1.5" fill="#cfa14a" />
          <circle cx="106" cy="14" r="1.5" fill="#cfa14a" />
          <circle cx="14" cy="70" r="1.5" fill="#cfa14a" />
          <circle cx="106" cy="70" r="1.5" fill="#cfa14a" />
          <!-- Brand plate -->
          <rect x="50" y="76" width="20" height="3" rx="1" fill="#a87830" />
        </svg>
      </figure>

      <!-- EQ — sliders verticales -->
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">EQ</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="EQ chassis variant A">
          <defs>
            <linearGradient id="pg-eq-face" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#262626" />
              <stop offset="1" stop-color="#0d0d0d" />
            </linearGradient>
            <linearGradient id="pg-eq-track" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#000" />
              <stop offset="1" stop-color="#262626" />
            </linearGradient>
            <linearGradient id="pg-eq-cap" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="#f8f8f8" />
              <stop offset="1" stop-color="#b0b0b0" />
            </linearGradient>
          </defs>
          <rect x="2" y="4" width="116" height="76" rx="6" fill="#0a0a0a" />
          <rect x="6" y="8" width="108" height="68" rx="3" fill="url(#pg-eq-face)" />
          <!-- 4 faders with tick marks -->
          @for (fader of faders; track fader.x) {
            <rect [attr.x]="fader.x - 1.5" y="16" width="3" height="52" rx="1" fill="url(#pg-eq-track)" />
            <line [attr.x1]="fader.x - 4" [attr.x2]="fader.x + 4" [attr.y1]="fader.tickY" [attr.y2]="fader.tickY" stroke="#6a6a6a" stroke-width="0.4" />
            <rect [attr.x]="fader.x - 4" [attr.y]="fader.capY - 2" width="8" height="4" rx="1" fill="url(#pg-eq-cap)" stroke="#1a1a1a" stroke-width="0.4" />
          }
          <!-- Bypass LED + label -->
          <circle cx="14" cy="14" r="1.4" fill="#ef4444" />
          <text x="20" y="16" font-family="ui-monospace, monospace" font-size="5" fill="#9a9a9a">EQ</text>
        </svg>
      </figure>

      <!-- RVB — matriz 2×2 de perillas -->
      <figure class="pg-chassis-card">
        <figcaption class="pg-chassis-label">RVB</figcaption>
        <svg viewBox="0 0 120 84" class="pg-chassis-svg" aria-label="RVB chassis variant A">
          <defs>
            <radialGradient id="pg-rvb-knob" cx="0.35" cy="0.35" r="0.7">
              <stop offset="0" stop-color="#3a3a3a" />
              <stop offset="0.7" stop-color="#0a0a0a" />
              <stop offset="1" stop-color="#000" />
            </radialGradient>
          </defs>
          <rect x="2" y="4" width="116" height="76" rx="6" fill="#0d0d0d" />
          <rect x="6" y="8" width="108" height="68" rx="3" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="0.5" />
          <!-- 2×2 knob matrix -->
          @for (knob of knobs; track knob.x) {
            <circle [attr.cx]="knob.x" [attr.cy]="knob.y" r="11" fill="url(#pg-rvb-knob)" stroke="#000" stroke-width="0.5" />
            <line [attr.x1]="knob.x" [attr.y1]="knob.y" [attr.x2]="knob.x + knob.ix" [attr.y2]="knob.y + knob.iy" stroke="#fff" stroke-width="0.7" stroke-linecap="round" />
            <circle [attr.cx]="knob.x" [attr.cy]="knob.y" r="1" fill="#3a3a3a" />
          }
          <!-- Top jacks -->
          <rect x="22" y="6" width="6" height="3" rx="0.5" fill="#000" stroke="#3a3a3a" stroke-width="0.3" />
          <rect x="92" y="6" width="6" height="3" rx="0.5" fill="#000" stroke="#3a3a3a" stroke-width="0.3" />
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
        background: #111;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
      }
      .pg-chassis-label {
        font-size: 0.625rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #9a9a9a;
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
export class PgChassisVariantA {
  // Fader positions and trim — fixed so the variant is stable across
  // renders. x positions span the faceplate; tickY/capY draw a slight
  // EQ curve that reads as "engineered" without being noisy.
  protected readonly faders = [
    { x: 28, tickY: 24, capY: 24 },
    { x: 48, tickY: 48, capY: 48 },
    { x: 72, tickY: 32, capY: 32 },
    { x: 92, tickY: 56, capY: 56 },
  ];

  // 2×2 knob matrix — positions in a 120×84 viewBox. ix/iy is the
  // indicator line angle (-45° to +135° from north), giving each knob
  // its own setting so the four don't look identical.
  protected readonly knobs = [
    { x: 40, y: 32, ix: 0, iy: -7 },
    { x: 80, y: 32, ix: 5, iy: -5 },
    { x: 40, y: 56, ix: -5, iy: 5 },
    { x: 80, y: 56, ix: 6, iy: 2 },
  ];
}