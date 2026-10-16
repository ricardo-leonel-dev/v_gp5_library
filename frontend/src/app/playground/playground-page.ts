import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PgChassisVariantA } from './surfaces/chassis/chassis-variant-a.component';
import { PgChassisVariantB } from './surfaces/chassis/chassis-variant-b.component';
import { PgChassisVariantC } from './surfaces/chassis/chassis-variant-c.component';
import { PgBlockDetailVariantA } from './surfaces/block-detail/block-detail-variant-a.component';
import { PgBlockDetailVariantB } from './surfaces/block-detail/block-detail-variant-b.component';
import { PgBlockDetailVariantC } from './surfaces/block-detail/block-detail-variant-c.component';
import { PgChromeVariantA } from './surfaces/chrome/chrome-variant-a.component';
import { PgChromeVariantB } from './surfaces/chrome/chrome-variant-b.component';
import { PgChromeVariantC } from './surfaces/chrome/chrome-variant-c.component';
import { PgChainStripVariantA } from './surfaces/chain-strip/chain-strip-variant-a.component';
import { PgChainStripVariantB } from './surfaces/chain-strip/chain-strip-variant-b.component';
import { PgChainStripVariantC } from './surfaces/chain-strip/chain-strip-variant-c.component';
import { PgNavVariantA } from './surfaces/nav/nav-variant-a.component';
import { PgNavVariantB } from './surfaces/nav/nav-variant-b.component';
import { PgNavVariantC } from './surfaces/nav/nav-variant-c.component';
import {
  PlaygroundPicks,
  type PlaygroundSurface,
  type PlaygroundVariant,
} from './playground-picks.service';

// Top-level container for the F17 v6 /playground sandbox. Renders 5
// surfaces × 3 variants = 15 visual treatments side-by-side so Ricardo
// can pick a winner for each before v6 spec work starts. Dev-only: this
// route is omitted from production builds via the `fileReplacements`
// entry in angular.json (see `app.routes.ts`).
@Component({
  selector: 'app-playground-f17-v6',
  imports: [
    PgChassisVariantA,
    PgChassisVariantB,
    PgChassisVariantC,
    PgBlockDetailVariantA,
    PgBlockDetailVariantB,
    PgBlockDetailVariantC,
    PgChromeVariantA,
    PgChromeVariantB,
    PgChromeVariantC,
    PgChainStripVariantA,
    PgChainStripVariantB,
    PgChainStripVariantC,
    PgNavVariantA,
    PgNavVariantB,
    PgNavVariantC,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './playground-page.html',
  styleUrl: './playground-page.css',
})
export class PlaygroundF17V6 {
  protected readonly picks = inject(PlaygroundPicks);

  // Static metadata: surface titles, descriptions, anchor ids. Keeping
  // it as a `readonly` array (not a signal) because nothing changes
  // here at runtime.
  protected readonly surfaces: ReadonlyArray<{
    id: PlaygroundSurface;
    title: string;
    description: string;
    variants: ReadonlyArray<{
      letter: 'A' | 'B' | 'C';
      concept: string;
      what: string;
    }>;
  }> = [
    {
      id: 'chassis',
      title: 'Chassis (AMP, CAB, EQ, RVB)',
      description:
        'How the four chassis categories are drawn. All 4 categories shown side by side so the visual language is comparable at a glance.',
      variants: [
        {
          letter: 'A',
          concept: 'Product photo realism',
          what: 'Dark tolex body, brushed metal faceplate, gold piping, real screws, real grille pattern, real speaker cone, real faders, real 2×2 knob matrix.',
        },
        {
          letter: 'B',
          concept: 'Vector icon set',
          what: 'Bold flat illustration, unified outline weight, one accent color per chassis. Reads as a designed icon family, not a photograph.',
        },
        {
          letter: 'C',
          concept: 'Minimal monochrome outline',
          what: 'Pure 1.5px outline silhouettes, no fills, technical-drawing aesthetic. Apple-meets-Teenage-Engineering.',
        },
      ],
    },
    {
      id: 'block-detail',
      title: 'Block detail panel',
      description:
        'The right-side panel that opens when a chassis is clicked. Three different treatments for the "manual names unverified" warning.',
      variants: [
        {
          letter: 'A',
          concept: 'Tooltip only',
          what: 'Warning removed entirely. Trust the user. Title, category, on/off, params, close.',
        },
        {
          letter: 'B',
          concept: 'Quiet badge in header',
          what: 'Small pill next to the title with an `i` glyph and "unverified" label. Hover/focus shows tooltip with the long-form note.',
        },
        {
          letter: 'C',
          concept: 'Subtle muted footnote',
          what: 'Single line of muted text at the bottom of the panel, no border, no icon, no color.',
        },
      ],
    },
    {
      id: 'chrome',
      title: 'Page chrome (header + drawer + tab)',
      description:
        'How the page itself is dressed: header controls, mock button placement, drawer wrapper, floating left tab.',
      variants: [
        {
          letter: 'A',
          concept: 'Ghost link with icon',
          what: 'Mock button reduced to a text link with a download icon, sitting next to lang/theme. Quiet escape hatch.',
        },
        {
          letter: 'B',
          concept: 'Outlined dev button',
          what: 'Smaller dashed-outline button labeled "Mock data" with a small icon. Quieter than the v5 indigo filled button.',
        },
        {
          letter: 'C',
          concept: 'Floating dev drawer',
          what: 'No mock control in the toolbar. A tiny "DEV" tag in the corner opens a slide-out panel. Production chrome looks completely clean.',
        },
      ],
    },
    {
      id: 'chain-strip',
      title: 'Chain strip (collapsed preset rows)',
      description:
        'How each block in a chain is represented in the compact horizontal strip — not a Material chip.',
      variants: [
        {
          letter: 'A',
          concept: 'Mini chassis silhouette',
          what: 'Each block is the actual chassis at 1/4 scale: real knobs, sliders, grille, speaker. Reads as a hardware strip.',
        },
        {
          letter: 'B',
          concept: 'Bold iconic glyph only',
          what: 'Bigger pedal-glyph, no background pill, no 3-letter code. Category color becomes the icon color, not the fill.',
        },
        {
          letter: 'C',
          concept: 'Color band + letter',
          what: 'Flat color stripe with a single uppercase letter in heavy display serif. Vintage aesthetic.',
        },
      ],
    },
    {
      id: 'nav',
      title: 'Preset list navigation',
      description:
        'How the preset list interacts with selection, expansion, and collapse. Three genuinely different interaction models.',
      variants: [
        {
          letter: 'A',
          concept: 'Selected-only chips',
          what: 'Hide the full list. Only the selected presets show as chips; board fills the main area. "Browse…" opens a picker.',
        },
        {
          letter: 'B',
          concept: 'Full list + inline expand',
          what: 'Whole preset list always visible. Clicking a row toggles inline board expansion. Tightened current v5 model.',
        },
        {
          letter: 'C',
          concept: 'Sticky toolbar + popup',
          what: 'Vertical left strip with preset numbers as tiles; clicking opens a card with the chain board to the right. Main area stays full-width.',
        },
      ],
    },
  ];

  // Stable "picks summary" string for the fixed picker header.
  protected readonly summary = computed(() => {
    const p = this.picks.picks();
    const order: PlaygroundSurface[] = ['chassis', 'block-detail', 'chrome', 'chain-strip', 'nav'];
    return order
      .filter((s) => p.has(s))
      .map((s) => `${s}=${p.get(s)}`)
      .join('  ·  ');
  });

  pick(surface: PlaygroundSurface, variant: PlaygroundVariant): void {
    this.picks.pick(surface, variant);
  }

  isPicked(surface: PlaygroundSurface, variant: PlaygroundVariant): boolean {
    return this.picks.picks().get(surface) === variant;
  }
}