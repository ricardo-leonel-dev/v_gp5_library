// F36 R5 — pure validator for the attach-panel draft. Counts label
// length in Unicode code points (Postgres `VARCHAR(255)` counts code
// points, not UTF-16 units), so a label of 255 `😀` fits while a 256th
// code point doesn't.

export const LABEL_MAX_CODE_POINTS = 255;

export type AttachDraftError = 'pedal_required' | 'label_required' | 'label_too_long';

export type AttachDraftResult =
  | { valid: true; pedalId: string; label: string }
  | { valid: false; error: AttachDraftError };

export function validateAttachDraft(
  pedalId: string | null,
  rawLabel: string,
): AttachDraftResult {
  if (pedalId === null) {
    return { valid: false, error: 'pedal_required' };
  }
  const trimmed = rawLabel.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'label_required' };
  }
  if ([...trimmed].length > LABEL_MAX_CODE_POINTS) {
    return { valid: false, error: 'label_too_long' };
  }
  return { valid: true, pedalId, label: trimmed };
}