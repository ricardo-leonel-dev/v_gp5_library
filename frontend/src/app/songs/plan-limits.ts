// F4 `save_preset_dialog` — `GET /me/plan` parser. Internal shape stays
// flat (Rev 5); the parser is the only thing that knows the wire shape.

// Internal — flat. Used by `SaveSongDraft.presetsPerSongLimit`, the dialog
// `atCap`/`songLimitReached` computed signals, and `validateSaveSongDraft`.
export interface PlanLimits {
  plan: string;
  songLimit: number | null;
  presetsPerSongLimit: number | null;
  songCount: number;
}

const REJECT = Symbol('plan-limits-parse-reject');

// Revision 5 wire shape (nested):
//   { plan: string,
//     limits: { songs: number|null, presetsPerSong: number|null },
//     usage:  { songs: number } }
// `null` = unlimited; `usage.songs` = live, non-soft-deleted songs. Anything
// else (missing `limits`/`usage`/nested field, the old flat shape, strings,
// negative numbers, etc.) → null (R59).
export function parsePlanLimits(json: unknown): PlanLimits | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;

  if (typeof obj['plan'] !== 'string') return null;

  const limits = obj['limits'];
  if (!limits || typeof limits !== 'object') return null;
  const limitsObj = limits as Record<string, unknown>;
  const songLimit = parseNonNegativeIntOrNull(limitsObj['songs']);
  if (songLimit === REJECT) return null;
  const presetsPerSongLimit = parseNonNegativeIntOrNull(limitsObj['presetsPerSong']);
  if (presetsPerSongLimit === REJECT) return null;

  const usage = obj['usage'];
  if (!usage || typeof usage !== 'object') return null;
  const usageObj = usage as Record<string, unknown>;
  const songCount = parseNonNegativeInt(usageObj['songs']);
  if (songCount === REJECT) return null;

  return {
    plan: obj['plan'],
    songLimit,
    presetsPerSongLimit,
    songCount,
  };
}

function parseNonNegativeIntOrNull(value: unknown): number | null | typeof REJECT {
  if (value === null) return null;
  return parseNonNegativeInt(value);
}

function parseNonNegativeInt(value: unknown): number | typeof REJECT {
  if (typeof value !== 'number') return REJECT;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return REJECT;
  return value;
}