import { describe, expect, it } from 'vitest';
import { LABEL_MAX_CODE_POINTS, validateAttachDraft } from './attach-draft';

// F36 R5 — `validateAttachDraft` orders pedal_required → label_required
// (trimmed empty) → label_too_long (Unicode code points > 255). A label
// of 255 smileys (510 UTF-16 code units) is valid; a 256-code-point
// label is too long. Whitespace-only labels are trimmed before the
// length check.
describe('validateAttachDraft (F36 R5)', () => {
  it.each([
    { name: 'a: no pedal selected, valid label → pedal_required', pedalId: null, raw: 'Lead', want: { valid: false, error: 'pedal_required' } },
    { name: 'b: pedal selected, empty label → label_required', pedalId: 'p1', raw: '', want: { valid: false, error: 'label_required' } },
    { name: 'c: pedal selected, whitespace-only label → label_required', pedalId: 'p1', raw: '   ', want: { valid: false, error: 'label_required' } },
    { name: 'd: pedal selected, 256 code points → label_too_long', pedalId: 'p1', raw: 'x'.repeat(256), want: { valid: false, error: 'label_too_long' } },
    { name: 'd-boundary: 255 code points → valid', pedalId: 'p1', raw: 'x'.repeat(255), want: { valid: true, pedalId: 'p1', label: 'x'.repeat(255) } },
  ])('case $name', ({ pedalId, raw, want }) => {
    expect(validateAttachDraft(pedalId, raw)).toEqual(want);
  });

  it('e: 255 smileys (510 UTF-16 units) → valid', () => {
    const label = '😀'.repeat(LABEL_MAX_CODE_POINTS);
    expect(validateAttachDraft('p1', label)).toEqual({
      valid: true,
      pedalId: 'p1',
      label,
    });
  });

  it('f: leading/trailing whitespace is trimmed on a valid label', () => {
    expect(validateAttachDraft('p1', '  Lead boost  ')).toEqual({
      valid: true,
      pedalId: 'p1',
      label: 'Lead boost',
    });
  });

  it('precedence: pedal_required wins over label_too_long', () => {
    expect(validateAttachDraft(null, 'x'.repeat(300))).toEqual({
      valid: false,
      error: 'pedal_required',
    });
  });

  it('precedence: label_required wins over label_too_long', () => {
    expect(validateAttachDraft('p1', '   ')).toEqual({
      valid: false,
      error: 'label_required',
    });
  });

  it('does not throw on non-finite inputs (defensive)', () => {
    expect(validateAttachDraft('p1', '  ok  ')).toEqual({
      valid: true,
      pedalId: 'p1',
      label: 'ok',
    });
  });
});