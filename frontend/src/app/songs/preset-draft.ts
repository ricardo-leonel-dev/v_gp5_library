// F27 `song_preset_duplicate_edit_export` — pure draft model. No DI, no I/O,
// every helper returns a new object (never aliases the input chain or body).
// Owned by the song detail page; the dialog / block-detail components
// receive plain values from it.
//
// Requirements covered here:
//  R10 — `createDraft` builds a draft from a source's `.prst` bytes without
//        any network mutation (the page calls `SongsApi.getSongPreset` and
//        passes the bytes in).
//  R11 — `suggestCopyName` produces `<source> 2`, `<source> 3`, ... so the
//        result fits 16 characters.
//  R17 — `setBlockEnabled` flips the block's `enabled` value and bumps
//        `edited` to `true`.
//  R19 — `setBlockParameter` writes a finite `p<k>` value into the block.
//  R20 — `parseParamInput` parses user-typed numbers (empty / non-finite →
//        `null`).
//  R22 — `setBlockModule` swaps the block's `moduleType` and keeps the
//        block's parameter values unchanged.
//  R25-R27 — `validateDraftName` returns the first error (`name_required` /
//        `name_unsupported` / `name_duplicate`) or `null`.
//  R29 — `renameDraft` sets the new name and marks the draft `edited`.
//  R37 — `draftToPrst` produces a 507-byte `.prst` from the draft's patched
//        body and name field that `decodePrstFile` accepts.
//  R40 — `draftToPreset` builds a `Preset` for `writePreset` with the
//        patched body and name field as `raw`.

import type { Preset, PresetSlot } from '../midi/preset';
import { patchGp5Body } from '../midi/gp5-sysex-preset-codec';
import {
  decodePrstFile,
  encodePrstFile,
  encodePrstNameField,
  isReadablePrstNameField,
} from '../midi/gp5-prst-file';
import { GP5_BODY_LEN, NAME_LEN } from '../midi/gp5-sysex-preset-codec';

export interface PresetDraft {
  readonly sourceSortOrder: number;
  readonly sourceName: string;
  readonly name: string;
  readonly sourceBody: Uint8Array;
  readonly sourceNameField: Uint8Array;
  readonly chain: readonly PresetSlot[];
  readonly edited: boolean;
}

export type DraftNameError = 'name_required' | 'name_unsupported' | 'name_duplicate';

// R11 — pick the first of `<source> 2`, `<source> 3`, ... that fits 16
// characters and is not already a song name. The truncation trims trailing
// spaces from the truncated source so `<source> 2` is well-formed.
export function suggestCopyName(sourceName: string, songNames: readonly string[]): string {
  const taken = new Set(songNames);
  for (let n = 2; n < 1000; n++) {
    const suffix = ' ' + n;
    const maxBase = 16 - suffix.length;
    const base = sourceName.slice(0, maxBase).trimEnd();
    const candidate = base + suffix;
    if (!taken.has(candidate)) return candidate;
  }
  // Fall back to an unreachable code path: 1000 * 2 chars = 2000 > 16*100,
  // and song names cannot realistically cover 1000 collisions. Returning the
  // first candidate is still a deterministic, rule-following answer.
  return sourceName.slice(0, 16).trimEnd() + ' 2';
}

// R10 — `createDraft` parses the source's bytes with `decodePrstFile`,
// keeps the original chain, and picks a copy name not already in the song.
// Returns `{ ok: false }` if the bytes do not decode.
export function createDraft(
  sourceSortOrder: number,
  bytes: Uint8Array,
  songNames: readonly string[],
): { ok: true; draft: PresetDraft } | { ok: false } {
  const decoded = decodePrstFile(bytes);
  if (!decoded.ok) return { ok: false };
  const sourceName = decoded.name;
  const sourceNameField = bytes.subarray(0x19, 0x19 + NAME_LEN).slice();
  const sourceBody = bytes.subarray(0x29, 0x29 + GP5_BODY_LEN).slice();
  const name = suggestCopyName(sourceName, songNames);
  return {
    ok: true,
    draft: {
      sourceSortOrder,
      sourceName,
      name,
      sourceBody,
      sourceNameField,
      chain: decoded.chain.map((b) => ({
        moduleType: b.moduleType,
        enabled: b.enabled,
        parameters: { ...b.parameters },
      })),
      edited: false,
    },
  };
}

// R25-R27 — name validation. Order: required → unsupported → duplicate.
export function validateDraftName(
  name: string,
  songNames: readonly string[],
): DraftNameError | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'name_required';
  if (trimmed.length > 16) return 'name_unsupported';
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return 'name_unsupported';
  }
  if (songNames.includes(trimmed)) return 'name_duplicate';
  return null;
}

// R20 — empty / non-finite input → `null`. The input may be the literal
// value the user typed in the input box.
export function parseParamInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

function updateChain(
  draft: PresetDraft,
  pos: number,
  mutate: (slot: PresetSlot) => PresetSlot,
): PresetDraft {
  return {
    ...draft,
    chain: draft.chain.map((b, i) => (i === pos ? mutate(b) : b)),
    edited: true,
  };
}

// R17 — flip a block's `enabled` value.
export function setBlockEnabled(d: PresetDraft, pos: number, enabled: boolean): PresetDraft {
  return updateChain(d, pos, (b) => ({ ...b, enabled }));
}

// R19 — write a finite `p<k>` value into a block.
export function setBlockParameter(d: PresetDraft, pos: number, key: string, value: number): PresetDraft {
  return updateChain(d, pos, (b) => ({ ...b, parameters: { ...b.parameters, [key]: value } }));
}

// R22 — swap a block's `moduleType`, keep its parameters.
export function setBlockModule(d: PresetDraft, pos: number, moduleType: string): PresetDraft {
  return updateChain(d, pos, (b) => ({ ...b, moduleType }));
}

// R29 — rename a draft, mark it edited.
export function renameDraft(d: PresetDraft, name: string): PresetDraft {
  return { ...d, name, edited: true };
}

// R37 — build the .prst the user will download. Patches the body in place
// (so an unedited draft round-trips byte-for-byte) and replaces the name
// field with the (trimmed, validated) draft name.
export function draftToPrst(d: PresetDraft): Uint8Array {
  const trimmed = d.name.trim();
  const nameField = encodePrstNameField(trimmed);
  const body = patchGp5Body(d.sourceBody, d.chain);
  const preset: Preset = {
    slot: 0,
    name: trimmed,
    chain: [...d.chain],
    raw: { body, nameField },
  };
  return encodePrstFile(preset);
}

// R40 — build a Preset for `writePreset`. The body and name field are
// verbatim from `draftToPrst`; the `slot` is filled in by the caller.
export function draftToPreset(d: PresetDraft, slot: number): Preset {
  const prst = draftToPrst(d);
  return {
    slot,
    name: d.name.trim(),
    chain: [...d.chain],
    raw: {
      body: prst.subarray(0x29, 0x29 + GP5_BODY_LEN).slice(),
      nameField: prst.subarray(0x19, 0x19 + NAME_LEN).slice(),
    },
  };
}

// R37 — turn the draft's name into a safe file name. Replaces every
// character outside `[A-Za-z0-9 _-]` with `_`.
export function exportFileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') return 'preset.prst';
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i]!;
    if (/[A-Za-z0-9 _-]/.test(c)) out += c;
    else out += '_';
  }
  return out + '.prst';
}

// F31-only, kept here so the page can call it. The F31 task list owns the
// actual save flow. The mapping follows the F31 design contract.
export type SaveDraftErrorKey =
  | 'limit_reached_save'
  | 'name_taken'
  | 'unreachable'
  | 'session_expired'
  | 'song_not_found'
  | 'rejected'
  | 'save_failed';

export function mapSaveDraftError(err: unknown): SaveDraftErrorKey {
  // The HTTP error class is the only one we ship today; this stays
  // narrow so the page can rely on the F31 contract.
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status: number }).status
      : 0;
  switch (status) {
    case 402:
      return 'limit_reached_save';
    case 409:
      return 'name_taken';
    case 401:
      return 'session_expired';
    case 404:
      return 'song_not_found';
    case 400:
      return 'rejected';
    case 0:
      return 'unreachable';
    default:
      return 'save_failed';
  }
}

// Re-export so callers don't have to reach into `gp5-prst-file` directly.
export { isReadablePrstNameField };
