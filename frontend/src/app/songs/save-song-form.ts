// F4 `save_preset_dialog` — pure form logic. No Angular DI, no I/O, no
// `TestBed`. Every helper returns new arrays/maps/strings; never aliases
// inputs.

import type { Preset, PresetSlot } from '../midi/preset';
import {
  decodePrstFile,
  encodePrstFile,
  isReadablePrstNameField,
  type PrstDecodeResult,
} from '../midi/gp5-prst-file';
import { describeModuleType, parseModuleType } from '../midi/gp5-module-vocabulary';

export const SONG_TEXT_MAX = 255;
export const EXTRA_CONFIG_MAX_BYTES = 32768;
export const FILE_NAME_MAX = 255;

export type SongPresetEntry =
  | {
      readonly key: string;
      readonly source: 'pedal';
      readonly name: string;
      readonly chain: readonly PresetSlot[];
      readonly preset: Preset;
      readonly nameReadable: boolean;
    }
  | {
      readonly key: string;
      readonly source: 'file';
      readonly name: string;
      readonly chain: readonly PresetSlot[];
      readonly fileName: string;
      readonly bytes: Uint8Array;
      readonly nameReadable: boolean;
    };

export interface ExtraConfigRow {
  readonly id: number;
  key: string;
  value: string;
}

export type UserSlotKind = 'ir' | 'nam';

export interface UserSlotRef {
  readonly kind: UserSlotKind;
  readonly slot: number;
}

export interface SaveSongDraft {
  entries: readonly SongPresetEntry[];
  name: string;
  artist: string;
  cover: File | null;
  extraRows: readonly ExtraConfigRow[];
  attachments: ReadonlyMap<string, File>; // key `${kind}:${slot}`
  presetsPerSongLimit: number | null;
}

export interface SaveSongErrors {
  name?: string;
  artist?: string;
  cover?: string;
  extraConfig?: string;
  presets?: { key: string; params?: Record<string, number> };
  entryRows: Readonly<Record<string, { key: string; params: Record<string, string> }>>;
  extraRows: Readonly<Record<number, string>>;
  attachments: Readonly<Record<string, string>>;
}

// ---------- entry construction (R34-R50) ----------

export function pedalEntry(p: Preset): SongPresetEntry {
  return {
    key: `pedal:${p.slot}`,
    source: 'pedal',
    name: p.name.trim(),
    chain: p.chain,
    preset: p,
    nameReadable: p.raw ? isReadablePrstNameField(p.raw.nameField) : true,
  };
}

export function fileEntry(
  key: string,
  fileName: string,
  decoded: { name: string; chain: readonly PresetSlot[]; bytes: Uint8Array; nameReadable: boolean },
): SongPresetEntry {
  return {
    key,
    source: 'file',
    name: decoded.name,
    chain: decoded.chain,
    fileName,
    bytes: decoded.bytes,
    nameReadable: decoded.nameReadable,
  };
}

export function moveEntry(
  list: readonly SongPresetEntry[],
  index: number,
  delta: -1 | 1,
): readonly SongPresetEntry[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return list;
  }
  const out = list.slice();
  const a = out[index];
  out[index] = out[target];
  out[target] = a;
  return out;
}

export function removeEntryAt(
  list: readonly SongPresetEntry[],
  index: number,
): readonly SongPresetEntry[] {
  if (index < 0 || index >= list.length) return list;
  const out = list.slice();
  out.splice(index, 1);
  return out;
}

export type AddResult =
  | { ok: true; list: readonly SongPresetEntry[] }
  | { ok: false; error: { key: string; params?: Record<string, string> } };

// Rev 5 — R114/R115 reject !nameReadable before the duplicate-name check.
// In practice only the duplicate-name check produces params; the
// presetNameUnsupported rejection never carries a name (the name may not be
// printable).
export function tryAppendEntry(
  list: readonly SongPresetEntry[],
  e: SongPresetEntry,
): AddResult {
  if (!e.nameReadable) {
    return { ok: false, error: { key: 'saveSong.errors.presetNameUnsupported' } };
  }
  const trimmed = e.name;
  for (const existing of list) {
    if (existing.name === trimmed) {
      return {
        ok: false,
        error: { key: 'saveSong.errors.presetNameDuplicate', params: { name: trimmed } },
      };
    }
  }
  return { ok: true, list: [...list, e] };
}

export function addablePresets(
  available: readonly Preset[],
  list: readonly SongPresetEntry[],
): Preset[] {
  const listedSlots = new Set<number>();
  for (const e of list) {
    if (e.source === 'pedal') listedSlots.add(e.preset.slot);
  }
  return available
    .filter((p) => !listedSlots.has(p.slot))
    .slice()
    .sort((a, b) => a.slot - b.slot);
}

// R45 (prst decode errors), R46 (empty name), R48 (file name too long).
// File-name length check first (R48) — runs before any byte read.
export function checkPrstPick(
  fileName: string,
  result: PrstDecodeResult,
): { key: string } | null {
  if (fileName.length > FILE_NAME_MAX) return { key: 'saveSong.errors.fileNameTooLong' };
  if (!result.ok) {
    switch (result.error) {
      case 'wrong_length':
        return { key: 'saveSong.errors.prstWrongSize' };
      case 'bad_header':
      case 'bad_sentinel':
        return { key: 'saveSong.errors.prstNotGp5' };
      case 'bad_crc':
        return { key: 'saveSong.errors.prstCorrupt' };
    }
  }
  if (result.name === '') return { key: 'saveSong.errors.prstNoName' };
  return null;
}

export function atPresetCap(count: number, limit: number | null): boolean {
  return limit !== null && count >= limit;
}

// ---------- IR / NAM detection (R72-R74, R76, R88-R89) ----------

export function detectUserSlots(entries: readonly SongPresetEntry[]): UserSlotRef[] {
  const seen = new Map<string, UserSlotRef>();
  for (const e of entries) {
    for (const slot of e.chain) {
      const parsed = parseModuleType(slot.moduleType);
      if (!parsed) continue;
      const described = describeModuleType(slot.moduleType);
      if (described.kind !== 'resolved' || described.slotNumber === undefined) continue;
      const kind: UserSlotKind = described.category === 'CAB' ? 'ir' : 'nam';
      const key = `${kind}:${described.slotNumber}`;
      if (!seen.has(key)) seen.set(key, { kind, slot: described.slotNumber });
    }
  }
  const irRefs = Array.from(seen.values())
    .filter((r) => r.kind === 'ir')
    .sort((a, b) => a.slot - b.slot);
  const namRefs = Array.from(seen.values())
    .filter((r) => r.kind === 'nam')
    .sort((a, b) => a.slot - b.slot);
  return [...irRefs, ...namRefs];
}

export function pruneAttachments(
  a: ReadonlyMap<string, File>,
  refs: readonly UserSlotRef[],
): ReadonlyMap<string, File> {
  const keep = new Set(refs.map((r) => `${r.kind}:${r.slot}`));
  const next = new Map<string, File>();
  for (const [key, value] of a) {
    if (keep.has(key)) next.set(key, value);
  }
  return next;
}

// ---------- file picking (R63, R64) ----------

export function checkPickedFile(file: File, kind: 'cover' | 'ir' | 'nam'): string | null {
  if (file.name.length > FILE_NAME_MAX) return 'saveSong.errors.fileNameTooLong';
  if (kind === 'cover' && !file.type.startsWith('image/')) {
    return 'saveSong.errors.coverNotImage';
  }
  return null;
}

// ---------- extra config (R67-R69, R86-R87) ----------

export function serializeExtraConfig(rows: readonly ExtraConfigRow[]): string | null {
  const keyed: { key: string; value: string }[] = [];
  for (const r of rows) {
    const trimmedKey = r.key.trim();
    if (trimmedKey === '' && r.value === '') continue;
    keyed.push({ key: trimmedKey, value: r.value });
  }
  if (keyed.length === 0) return null;
  const obj: Record<string, string> = {};
  for (const { key, value } of keyed) obj[key] = value;
  return JSON.stringify(obj);
}

// ---------- validation (R51, R52, R56, R60-R62, R67-R69, R116) ----------

export function validateSaveSongDraft(d: SaveSongDraft): SaveSongErrors {
  const entryRows: Record<string, { key: string; params: Record<string, string> }> = {};
  const extraRows: Record<number, string> = {};
  const nameErrors: string[] = [];
  const artistErrors: string[] = [];
  const extraConfigErrors: string[] = [];
  let presets: { key: string; params?: Record<string, number> } | undefined;
  const seenNames = new Set<string>();
  let duplicates = false;

  for (const e of d.entries) {
    if (!e.nameReadable) {
      // R116: unreadable overrides any duplicate on the same row.
      entryRows[e.key] = { key: 'saveSong.errors.presetNameUnsupported', params: {} };
      continue;
    }
    if (seenNames.has(e.name)) {
      entryRows[e.key] = {
        key: 'saveSong.errors.presetNameDuplicate',
        params: { name: e.name },
      };
      duplicates = true;
    } else {
      seenNames.add(e.name);
    }
  }
  // R52: if duplicates were found but the unreadable rows skipped above,
  // also flag any earlier-row duplicate that wasn't already covered. The
  // unreadable rows take precedence, so we only flag the later rows; the
  // earlier ones are already first occurrences.
  if (duplicates) {
    /* handled above */
  }

  if (d.entries.length === 0) {
    presets = { key: 'saveSong.errors.presetsRequired' };
  } else if (
    d.presetsPerSongLimit !== null &&
    d.entries.length > d.presetsPerSongLimit
  ) {
    presets = {
      key: 'saveSong.errors.presetLimitExceeded',
      params: { limit: d.presetsPerSongLimit },
    };
  }

  const trimmedName = d.name.trim();
  if (trimmedName === '') nameErrors.push('saveSong.errors.nameRequired');
  if (trimmedName.length > SONG_TEXT_MAX) nameErrors.push('saveSong.errors.nameTooLong');

  const trimmedArtist = d.artist.trim();
  if (trimmedArtist.length > SONG_TEXT_MAX) artistErrors.push('saveSong.errors.artistTooLong');

  // R67 / R68 — extra rows.
  const seenKeys = new Map<string, number>();
  for (const row of d.extraRows) {
    const trimmedKey = row.key.trim();
    const emptyKey = trimmedKey === '';
    const emptyValue = row.value === '';
    if (emptyKey && emptyValue) continue;
    if (emptyKey) {
      extraRows[row.id] = 'saveSong.errors.extraKeyRequired';
      continue;
    }
    const previous = seenKeys.get(trimmedKey);
    if (previous !== undefined) {
      extraRows[row.id] = 'saveSong.errors.extraKeyDuplicate';
    } else {
      seenKeys.set(trimmedKey, row.id);
    }
  }

  // R69 — JSON size cap.
  const json = serializeExtraConfig(d.extraRows);
  if (json !== null) {
    const size = new TextEncoder().encode(json).length;
    if (size > EXTRA_CONFIG_MAX_BYTES) {
      extraConfigErrors.push('saveSong.errors.extraConfigTooLarge');
    }
  }

  const errors: SaveSongErrors = {
    entryRows,
    extraRows,
    attachments: {},
  };
  if (nameErrors.length > 0) errors.name = nameErrors[nameErrors.length - 1];
  if (artistErrors.length > 0) errors.artist = artistErrors[artistErrors.length - 1];
  if (extraConfigErrors.length > 0) errors.extraConfig = extraConfigErrors[0];
  if (presets) errors.presets = presets;
  return errors;
}

export function hasErrors(e: SaveSongErrors): boolean {
  if (e.name || e.artist || e.cover || e.extraConfig || e.presets) return true;
  for (const _ of Object.values(e.entryRows)) return true;
  for (const _ of Object.values(e.extraRows)) return true;
  for (const _ of Object.values(e.attachments)) return true;
  return false;
}

// ---------- preset file name (R80) ----------

export function presetFileName(presetName: string): string {
  const lowered = presetName.toLowerCase();
  const decomposed = lowered.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  const squashed = decomposed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const trimmed = squashed.slice(0, 64);
  const base = trimmed.length > 0 ? trimmed : 'preset';
  return `${base}.prst`;
}

// ---------- FormData builder (R77-R90) ----------

export function buildSongFormData(d: SaveSongDraft): FormData {
  if (d.entries.length === 0) {
    throw new Error('no_presets');
  }
  const fd = new FormData();
  fd.set('name', d.name.trim());
  const trimmedArtist = d.artist.trim();
  if (trimmedArtist.length > 0) {
    fd.set('artist', trimmedArtist);
  }
  const extraConfigJson = serializeExtraConfig(d.extraRows);
  if (extraConfigJson !== null) {
    fd.set('extra_config', extraConfigJson);
  }

  for (const e of d.entries) {
    if (e.source === 'pedal') {
      const bytes = encodePrstFile(e.preset);
      const file = new File([bytes as BlobPart], presetFileName(e.name), {
        type: 'application/octet-stream',
      });
      fd.append('preset', file);
    } else {
      const file = new File([e.bytes as BlobPart], e.fileName, { type: 'application/octet-stream' });
      fd.append('preset', file);
    }
  }

  const refs = detectUserSlots(d.entries);
  const irs = refs.filter((r) => r.kind === 'ir');
  const nams = refs.filter((r) => r.kind === 'nam');
  for (const r of irs) {
    const f = d.attachments.get(`${r.kind}:${r.slot}`);
    if (f) fd.append('ir', f);
  }
  for (const r of nams) {
    const f = d.attachments.get(`${r.kind}:${r.slot}`);
    if (f) fd.append('nam', f);
  }
  if (d.cover) fd.append('cover', d.cover);

  return fd;
}

// Re-export for tests/dialog wiring.
export { decodePrstFile };