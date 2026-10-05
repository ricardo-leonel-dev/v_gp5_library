// F4 `save_preset_dialog` — the only F4-side shape the dialog reads back
// from `POST /songs`. The full multi-preset song DTO belongs to feature 26
// and is not needed for saving.
export interface CreatedSong {
  id: string;
  name: string;
}