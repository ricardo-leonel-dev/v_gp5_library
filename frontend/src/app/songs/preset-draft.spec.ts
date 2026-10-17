import { describe, expect, test } from 'vitest';
import {
  createDraft,
  draftToPreset,
  draftToPrst,
  exportFileName,
  parseParamInput,
  renameDraft,
  setBlockEnabled,
  setBlockModule,
  setBlockParameter,
  suggestCopyName,
  validateDraftName,
  type PresetDraft,
} from './preset-draft';
import { decodePrstFile, encodePrstFile } from '../midi/gp5-prst-file';
import { capturedBodyBytes } from '../midi/gp5-captured-bodies.fixture';
import { decodeGp5Body, NAME_LEN, GP5_BODY_LEN } from '../midi/gp5-sysex-preset-codec';
import type { Preset, PresetSlot } from '../midi/preset';

function readableNameField(name: string): Uint8Array {
  const f = new Uint8Array(NAME_LEN);
  const enc = new TextEncoder().encode(name);
  for (let i = 0; i < NAME_LEN; i++) f[i] = i < enc.length ? enc[i] : 0;
  return f;
}

function buildPrstBytes(name: string): Uint8Array {
  const body = capturedBodyBytes(0);
  const chain = decodeGp5Body(body, name, 0).chain;
  const preset: Preset = { slot: 0, name, chain, raw: { body, nameField: readableNameField(name) } };
  return encodePrstFile(preset);
}

function asChain(chain: readonly PresetSlot[]): PresetSlot[] {
  return chain.map((b) => ({ ...b, parameters: { ...b.parameters } }));
}

describe('suggestCopyName (R11)', () => {
  test('appends " 2" when the source is not in the song', () => {
    expect(suggestCopyName('LEAD', ['OTHER', 'CLEAN'])).toBe('LEAD 2');
  });

  test('increments the suffix until it is not taken', () => {
    expect(suggestCopyName('LEAD', ['LEAD', 'LEAD 2', 'LEAD 3'])).toBe('LEAD 4');
  });

  test('truncates the source name so the result fits 16 characters', () => {
    // 16-char input + " 2" = 18; truncate the source to 14 chars then trim.
    expect(suggestCopyName('ABCDEFGHIJKLMNOP', [])).toBe('ABCDEFGHIJKLMN 2');
  });

  test('the truncated result is at most 16 characters long', () => {
    const result = suggestCopyName('ABCDEFGHIJKLMNOPQRSTUVWXYZ', []);
    expect(result.length).toBeLessThanOrEqual(16);
  });
});

describe('createDraft (R10)', () => {
  test('returns ok:true and a fresh draft from a valid .prst', () => {
    const prst = buildPrstBytes('TL DLX AMP');
    const res = createDraft(0, prst, []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const d = res.draft;
    expect(d.sourceSortOrder).toBe(0);
    expect(d.sourceName).toBe('TL DLX AMP');
    expect(d.name).toBe('TL DLX AMP 2');
    expect(d.chain).toHaveLength(10);
    expect(d.edited).toBe(false);
    expect(d.sourceBody).toHaveLength(GP5_BODY_LEN);
    expect(d.sourceNameField).toHaveLength(NAME_LEN);
  });

  test('skips a name already in songNames', () => {
    const prst = buildPrstBytes('LEAD');
    const res = createDraft(0, prst, ['LEAD', 'LEAD 2']);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.draft.name).toBe('LEAD 3');
  });

  test('returns ok:false for bytes that do not decode as a .prst', () => {
    const res = createDraft(0, new Uint8Array(100), []);
    expect(res.ok).toBe(false);
  });
});

describe('validateDraftName (R25-R27)', () => {
  test('returns null for a valid unique name', () => {
    expect(validateDraftName('CLEAN', ['LEAD'])).toBeNull();
  });

  test('returns "name_required" for an empty or whitespace-only name', () => {
    expect(validateDraftName('', [])).toBe('name_required');
    expect(validateDraftName('   ', [])).toBe('name_required');
  });

  test('returns "name_unsupported" for a 17-character name', () => {
    expect(validateDraftName('ABCDEFGHIJKLMNOPQ', [])).toBe('name_unsupported');
  });

  test('returns "name_unsupported" for a non-printable or out-of-range character', () => {
    expect(validateDraftName('A\x01B', [])).toBe('name_unsupported');
    expect(validateDraftName('AB\x7f', [])).toBe('name_unsupported');
    expect(validateDraftName('CAFé', [])).toBe('name_unsupported');
  });

  test('returns "name_duplicate" when the trimmed name matches a song name', () => {
    expect(validateDraftName('  CLEAN  ', ['CLEAN'])).toBe('name_duplicate');
  });
});

describe('parseParamInput (R20)', () => {
  test('returns the number for a finite input', () => {
    expect(parseParamInput('0.5')).toBe(0.5);
    expect(parseParamInput('-3.14')).toBe(-3.14);
    expect(parseParamInput('  42  ')).toBe(42);
  });

  test('returns null for empty / non-numeric / non-finite input', () => {
    expect(parseParamInput('')).toBeNull();
    expect(parseParamInput('   ')).toBeNull();
    expect(parseParamInput('abc')).toBeNull();
    expect(parseParamInput('NaN')).toBeNull();
    expect(parseParamInput('Infinity')).toBeNull();
  });
});

describe('setBlockEnabled / setBlockParameter / setBlockModule / renameDraft (R17, R19, R22, R29)', () => {
  function freshDraft(): PresetDraft {
    const res = createDraft(0, buildPrstBytes('LEAD'), []);
    if (!res.ok) throw new Error('expected ok');
    return res.draft;
  }

  test('setBlockEnabled flips a block and marks the draft edited', () => {
    const d = freshDraft();
    const target = d.chain[3]!;
    const edited = setBlockEnabled(d, 3, !target.enabled);
    expect(edited.edited).toBe(true);
    expect(edited.chain[3]!.enabled).toBe(!target.enabled);
    expect(edited.chain[3]!.parameters).toEqual(target.parameters);
    // The chain array is fresh; the touched slot is a new object.
    expect(edited.chain).not.toBe(d.chain);
    expect(edited.chain[3]).not.toBe(d.chain[3]);
    expect(edited.chain[2]).toEqual(d.chain[2]);
  });

  test('setBlockParameter writes p0 and marks the draft edited', () => {
    const d = freshDraft();
    const edited = setBlockParameter(d, 2, 'p0', 0.25);
    expect(edited.edited).toBe(true);
    expect(edited.chain[2]!.parameters['p0']).toBe(0.25);
    // Other params on the same block stay.
    const before = d.chain[2]!.parameters;
    for (const k of Object.keys(before)) {
      if (k === 'p0') continue;
      expect(edited.chain[2]!.parameters[k]).toBe(before[k]);
    }
  });

  test('setBlockModule swaps the moduleType and keeps the parameters unchanged', () => {
    const d = freshDraft();
    const before = d.chain[2]!;
    const edited = setBlockModule(d, 2, 'cat7_fx4');
    expect(edited.edited).toBe(true);
    expect(edited.chain[2]!.moduleType).toBe('cat7_fx4');
    expect(edited.chain[2]!.parameters).toEqual(before.parameters);
  });

  test('renameDraft updates the name and marks the draft edited', () => {
    const d = freshDraft();
    const edited = renameDraft(d, 'LEAD 9');
    expect(edited.edited).toBe(true);
    expect(edited.name).toBe('LEAD 9');
  });

  test('mutators do not alias the source chain', () => {
    const d = freshDraft();
    const before = asChain(d.chain);
    void setBlockEnabled(d, 1, false);
    void setBlockParameter(d, 1, 'p0', 0.5);
    void setBlockModule(d, 1, 'cat0_fx0');
    expect(d.chain).toEqual(before);
    expect(d.edited).toBe(false);
  });
});

describe('draftToPrst + draftToPreset (R37, R40)', () => {
  test('draftToPrst of an unedited draft decodes back to the same chain with the new name', () => {
    const res = createDraft(0, buildPrstBytes('LEAD'), []);
    if (!res.ok) throw new Error('expected ok');
    const prst = draftToPrst(res.draft);
    const decoded = decodePrstFile(prst);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.name).toBe('LEAD 2');
    expect(decoded.chain).toEqual(res.draft.chain);
  });

  test('an edited draft (bypass flip, param change, effect swap) round-trips through draftToPrst', () => {
    const res = createDraft(0, buildPrstBytes('LEAD'), []);
    if (!res.ok) throw new Error('expected ok');
    let d = res.draft;
    d = setBlockEnabled(d, 4, !d.chain[4]!.enabled);
    d = setBlockParameter(d, 4, 'p0', 0.75);
    d = setBlockModule(d, 4, 'cat7_fx4');
    d = renameDraft(d, 'LEAD TWEAK');
    const prst = draftToPrst(d);
    const decoded = decodePrstFile(prst);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.name).toBe('LEAD TWEAK');
    expect(decoded.chain[4]!.enabled).toBe(d.chain[4]!.enabled);
    expect(decoded.chain[4]!.parameters['p0']).toBe(0.75);
    expect(decoded.chain[4]!.moduleType).toBe('cat7_fx4');
  });

  test('draftToPreset builds a Preset with the slot the caller chose and verbatim raw bytes', () => {
    const res = createDraft(0, buildPrstBytes('LEAD'), []);
    if (!res.ok) throw new Error('expected ok');
    const prst = draftToPrst(res.draft);
    const preset = draftToPreset(res.draft, 7);
    expect(preset.slot).toBe(7);
    expect(preset.raw?.body).toEqual(prst.subarray(0x29, 0x29 + GP5_BODY_LEN));
    expect(preset.raw?.nameField).toEqual(prst.subarray(0x19, 0x19 + NAME_LEN));
  });
});

describe('exportFileName (R37)', () => {
  test('replaces characters outside [A-Za-z0-9 _-] with _ and appends .prst', () => {
    expect(exportFileName('LEAD 2')).toBe('LEAD 2.prst');
    expect(exportFileName('A/B\\C?D')).toBe('A_B_C_D.prst');
    expect(exportFileName('café')).toBe('caf_.prst');
  });

  test('trims the name and falls back to "preset.prst" for an empty name', () => {
    expect(exportFileName('   ')).toBe('preset.prst');
    expect(exportFileName('')).toBe('preset.prst');
    expect(exportFileName('  LEAD  ')).toBe('LEAD.prst');
  });
});
