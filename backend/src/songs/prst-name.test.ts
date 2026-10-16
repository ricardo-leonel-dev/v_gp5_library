import { describe, expect, test } from "bun:test";
import { loadFixture, PRESET_FIXTURES } from "./fixtures";
import { PRST_NAME_OFFSET, readPresetName } from "./prst-name";

function withName(base: Uint8Array, name: number[]): Uint8Array {
  const copy = new Uint8Array(base);
  copy.fill(0x00, PRST_NAME_OFFSET, PRST_NAME_OFFSET + 16);
  copy.set(name, PRST_NAME_OFFSET);
  return copy;
}

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

describe("readPresetName", () => {
  for (const fixture of PRESET_FIXTURES) {
    test(`real sample ${fixture.file} returns "${fixture.name}" (R7)`, async () => {
      expect(readPresetName(await loadFixture(fixture.file))).toBe(fixture.name);
    });
  }

  test("a 16-char name with no NUL returns all 16 chars (R7)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    const bytes = withName(base, ascii("ABCDEFGHIJKLMNOP"));
    expect(readPresetName(bytes)).toBe("ABCDEFGHIJKLMNOP");
  });

  test("the name is returned untrimmed (R7)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, ascii(" LEAD ")))).toBe(" LEAD ");
  });

  test("40 bytes returns null (R8)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(base.slice(0, 40))).toBeNull();
    expect(readPresetName(new Uint8Array(0))).toBeNull();
  });

  test("exactly 41 bytes with a valid header and name returns the name (R7, R8)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(base.slice(0, 41))).toBe("TL DLX AMP");
  });

  test("a sample with byte 0 changed returns null (R9)", async () => {
    const bytes = new Uint8Array(await loadFixture(PRESET_FIXTURES[0].file));
    bytes[0] = 0x48;
    expect(readPresetName(bytes)).toBeNull();
  });

  test("a non-GP-5 byte array returns null (R9)", () => {
    expect(readPresetName(new Uint8Array(507).fill(0x41))).toBeNull();
  });

  test("an empty name (first name byte is NUL) returns null (R10)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, []))).toBeNull();
  });

  test("a name of only spaces returns null (R10)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, ascii("    ")))).toBeNull();
    expect(readPresetName(withName(base, ascii(" ".repeat(16))))).toBeNull();
  });

  test("a name containing 0x07 before the NUL returns null (R11)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, [...ascii("TL"), 0x07, ...ascii("X")]))).toBeNull();
  });

  test("a name containing 0xC3 before the NUL returns null (R11)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, [...ascii("CAF"), 0xc3, 0xa9]))).toBeNull();
  });

  test("a name containing 0x7F returns null (R11)", async () => {
    const base = await loadFixture(PRESET_FIXTURES[0].file);
    expect(readPresetName(withName(base, [...ascii("AB"), 0x7f]))).toBeNull();
  });
});
