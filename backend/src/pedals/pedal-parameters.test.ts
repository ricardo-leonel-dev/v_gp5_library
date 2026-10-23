import { describe, expect, test } from "bun:test";
import {
  findMissingParameterKeys,
  parseParameterDefinitions,
  validateConfigAgainstParameters,
  type ParameterDefinition,
} from "./pedal-parameters";

const knob = (overrides: Partial<{ min: number; max: number }> = {}): ParameterDefinition => ({
  key: "k",
  label: "K",
  type: "knob",
  min: 0,
  max: 10,
  ...overrides,
});

describe("parseParameterDefinitions — rejects malformed input (R2)", () => {
  // messageHint is the distinctive part of the error for the rule that must fire (first failing rule wins).
  const malformed: Array<[string, unknown, string]> = [
    ["b-object", { key: "gain", label: "G", type: "knob" }, "parameters must be a JSON array"],
    ["b-string", "x", "parameters must be a JSON array"],
    ["b-number", 3, "parameters must be a JSON array"],
    ["b-null", null, "parameters must be a JSON array"],
    ["d", ["not an object"], "parameters[0] must be an object"],
    ["e1", [{ label: "G", type: "knob" }], "parameters[0].key is invalid"],
    ["e2", [{ key: 7, label: "G", type: "knob" }], "parameters[0].key is invalid"],
    ["e3", [{ key: "  ", label: "G", type: "knob" }], "parameters[0].key is invalid"],
    ["f", [{ key: "k", label: "K", type: "knob" }, { key: "k", label: "K2", type: "knob" }], 'parameters has duplicate key "k"'],
    ["g1", [{ key: "k", type: "knob" }], "parameters[0].label is invalid"],
    ["g2", [{ key: "k", label: 7, type: "knob" }], "parameters[0].label is invalid"],
    ["g3", [{ key: "k", label: "   ", type: "knob" }], "parameters[0].label is invalid"],
    ["h1", [{ key: "k", label: "K" }], "parameters[0].type is invalid"],
    ["h2", [{ key: "k", label: "K", type: "pot" }], "parameters[0].type is invalid"],
    ["i1", [{ key: "k", label: "K", type: "knob", min: 1.5 }], "parameters[0].min is invalid"],
    ["i2", [{ key: "k", label: "K", type: "knob", min: "3" }], "parameters[0].min is invalid"],
    ["i3", [{ key: "k", label: "K", type: "knob", min: null }], "parameters[0].min is invalid"],
    ["i4", [{ key: "k", label: "K", type: "knob", max: NaN }], "parameters[0].max is invalid"],
    ["j1", [{ key: "k", label: "K", type: "knob", min: 10 }], "parameters[0].min must be less than max"],
    ["j2", [{ key: "k", label: "K", type: "knob", min: 5, max: 5 }], "parameters[0].min must be less than max"],
    ["j3", [{ key: "k", label: "K", type: "knob", max: -1 }], "parameters[0].min must be less than max"],
    ["k1", [{ key: "k", label: "K", type: "selector" }], "parameters[0].options must be a non-empty array"],
    ["k2", [{ key: "k", label: "K", type: "selector", options: [] }], "parameters[0].options must be a non-empty array"],
    ["k3", [{ key: "k", label: "K", type: "selector", options: "A" }], "parameters[0].options must be a non-empty array"],
    ["l1", [{ key: "k", label: "K", type: "selector", options: ["A", 7] }], "parameters[0].options[1] is invalid"],
    ["l2", [{ key: "k", label: "K", type: "selector", options: ["A", "  "] }], "parameters[0].options[1] is invalid"],
    ["l3", [{ key: "k", label: "K", type: "selector", options: ["A", "A"] }], "parameters[0].options[1] is invalid"],
  ];

  for (const [id, raw, messageHint] of malformed) {
    test(`case ${id} -> ok:false (${messageHint})`, () => {
      expect(parseParameterDefinitions(raw)).toEqual({ ok: false, error: messageHint });
    });
  }
});

describe("parseParameterDefinitions — normalization (R1)", () => {
  test("case b: drops extra fields from a definition", () => {
    const result = parseParameterDefinitions([
      { key: "k", label: "K", type: "knob", color: "red" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "k", label: "K", type: "knob", min: 0, max: 10 }],
    });
  });

  test("case e: knob without min/max -> min:0 max:10", () => {
    const result = parseParameterDefinitions([{ key: "level", label: "Level", type: "knob" }]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "level", label: "Level", type: "knob", min: 0, max: 10 }],
    });
  });

  test("case f: knob with -12..12 unchanged", () => {
    const result = parseParameterDefinitions([
      { key: "gain", label: "Gain", type: "knob", min: -12, max: 12 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "gain", label: "Gain", type: "knob", min: -12, max: 12 }],
    });
  });

  test("case g1: only min:2 -> min:2, max defaults to 10", () => {
    const result = parseParameterDefinitions([
      { key: "g", label: "G", type: "knob", min: 2 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "g", label: "G", type: "knob", min: 2, max: 10 }],
    });
  });

  test("case g2: only max:20 -> min defaults to 0, max:20", () => {
    const result = parseParameterDefinitions([
      { key: "g", label: "G", type: "knob", max: 20 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "g", label: "G", type: "knob", min: 0, max: 20 }],
    });
  });

  test("case h: knob carrying a step field is stored without step", () => {
    const result = parseParameterDefinitions([
      { key: "g", label: "G", type: "knob", step: 2 },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "g", label: "G", type: "knob", min: 0, max: 10 }],
    });
  });

  test("trims key and label", () => {
    const result = parseParameterDefinitions([
      { key: "  k  ", label: "  K  ", type: "knob" },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "k", label: "K", type: "knob", min: 0, max: 10 }],
    });
  });

  test("selector options are stored trimmed", () => {
    const result = parseParameterDefinitions([
      { key: "mode", label: "Mode", type: "selector", options: [" A ", "B"] },
    ]);
    expect(result).toEqual({
      ok: true,
      value: [{ key: "mode", label: "Mode", type: "selector", options: ["A", "B"] }],
    });
  });

  test("selector option that duplicates another after trimming is rejected", () => {
    const result = parseParameterDefinitions([
      { key: "mode", label: "Mode", type: "selector", options: [" A ", "B", "A"] },
    ]);
    expect(result).toEqual({ ok: false, error: "parameters[0].options[2] is invalid" });
  });
});

describe("validateConfigAgainstParameters (R5)", () => {
  const defs: ParameterDefinition[] = [
    { key: "gain", label: "Gain", type: "knob", min: 0, max: 10 },
    { key: "boost", label: "Boost", type: "switch" },
    { key: "mode", label: "Mode", type: "selector", options: ["A", "B"] },
  ];

  test("case a + d + f + i: knob 0/5/10, switch true/false, selector 'A', {} all pass", () => {
    expect(validateConfigAgainstParameters({ gain: 0 }, defs)).toEqual({
      ok: true,
      value: { gain: 0 },
    });
    expect(validateConfigAgainstParameters({ gain: 5 }, defs)).toEqual({
      ok: true,
      value: { gain: 5 },
    });
    expect(validateConfigAgainstParameters({ gain: 10 }, defs)).toEqual({
      ok: true,
      value: { gain: 10 },
    });
    expect(validateConfigAgainstParameters({ boost: true }, defs)).toEqual({
      ok: true,
      value: { boost: true },
    });
    expect(validateConfigAgainstParameters({ boost: false }, defs)).toEqual({
      ok: true,
      value: { boost: false },
    });
    expect(validateConfigAgainstParameters({ mode: "A" }, defs)).toEqual({
      ok: true,
      value: { mode: "A" },
    });
    expect(validateConfigAgainstParameters({}, defs)).toEqual({ ok: true, value: {} });
  });

  test("case b: knob out of range -> 400", () => {
    expect(validateConfigAgainstParameters({ gain: -1 }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ gain: 11 }, defs).ok).toBe(false);
  });

  test("case c: knob value not an integer -> 400", () => {
    expect(validateConfigAgainstParameters({ gain: 7.5 }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ gain: "5" }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ gain: true }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ gain: null }, defs).ok).toBe(false);
  });

  test("case e: switch non-boolean -> 400", () => {
    expect(validateConfigAgainstParameters({ boost: "on" }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ boost: 1 }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ boost: null }, defs).ok).toBe(false);
  });

  test("case g: selector unknown value, wrong case, wrong type -> 400", () => {
    expect(validateConfigAgainstParameters({ mode: "C" }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ mode: "a" }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ mode: 0 }, defs).ok).toBe(false);
    expect(validateConfigAgainstParameters({ mode: null }, defs).ok).toBe(false);
  });

  test("case h: config key not defined on the pedal -> 400", () => {
    expect(validateConfigAgainstParameters({ unknown: 1 }, defs).ok).toBe(false);
  });

  test("case j: one valid + one invalid entry -> 400, nothing stored", () => {
    const result = validateConfigAgainstParameters({ gain: 5, unknown: 1 }, defs);
    expect(result.ok).toBe(false);
  });
});

describe("findMissingParameterKeys", () => {
  const defs: ParameterDefinition[] = [
    { key: "gain", label: "Gain", type: "knob", min: 0, max: 10 },
    { key: "boost", label: "Boost", type: "switch" },
    { key: "mode", label: "Mode", type: "selector", options: ["A", "B"] },
  ];

  test("only the keys absent from the config, in definition order (R6)", () => {
    expect(findMissingParameterKeys({ gain: 5, boost: true, mode: "A" }, defs)).toEqual([]);
    expect(findMissingParameterKeys({ gain: 5 }, defs)).toEqual(["boost", "mode"]);
    expect(findMissingParameterKeys({ mode: "B" }, defs)).toEqual(["gain", "boost"]);
    expect(findMissingParameterKeys({}, defs)).toEqual(["gain", "boost", "mode"]);
    expect(findMissingParameterKeys({}, [])).toEqual([]);
  });
});