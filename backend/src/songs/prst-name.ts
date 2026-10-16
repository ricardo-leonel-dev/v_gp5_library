export const PRST_MAGIC = "GP-5";
export const PRST_NAME_OFFSET = 0x19;
export const PRST_NAME_MAX_LENGTH = 16;

const nameEnd = PRST_NAME_OFFSET + PRST_NAME_MAX_LENGTH;

export function readPresetName(bytes: Uint8Array): string | null {
  if (bytes.length < nameEnd) return null;

  for (let i = 0; i < PRST_MAGIC.length; i++) {
    if (bytes[i] !== PRST_MAGIC.charCodeAt(i)) return null;
  }

  let end = PRST_NAME_OFFSET;
  while (end < nameEnd && bytes[end] !== 0x00) end++;
  const field = bytes.subarray(PRST_NAME_OFFSET, end);

  for (const b of field) {
    if (b < 0x20 || b > 0x7e) return null;
  }

  const name = String.fromCharCode(...field);
  if (name.trim() === "") return null;
  return name;
}
