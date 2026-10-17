// F27 `song_preset_duplicate_edit_export` (R48-R55) — CanDeactivate guard
// for `/songs/:id`. Delegates to `SongDetailPage.confirmLeave()`, which
// synchronously allows navigation when no draft is edited (R53, R54) and
// otherwise holds the navigation and returns a Promise the leave dialog
// resolves (R49, R50).

import type { CanDeactivateFn } from '@angular/router';
import type { SongDetailPage } from './song-detail-page';

export const leaveDraftGuard: CanDeactivateFn<SongDetailPage> = (component) =>
  component.confirmLeave();
