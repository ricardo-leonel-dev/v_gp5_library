export type ParameterDefinition =
  | { key: string; label: string; type: "knob"; min: number; max: number }
  | { key: string; label: string; type: "switch" }
  | { key: string; label: string; type: "selector"; options: string[] };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const parameterTypes = new Set(["knob", "switch", "selector"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads the stored `pedal_catalog.parameters` column (already validated on write).
 * Accepts the jsonb value as returned by the driver (array or JSON text); anything else maps to [].
 */
export function parseStoredParameters(raw: unknown): ParameterDefinition[] {
  if (Array.isArray(raw)) return raw as ParameterDefinition[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ParameterDefinition[];
    } catch {
      /* fall through */
    }
  }
  return [];
}

export function parseParameterDefinitions(raw: unknown): ParseResult<ParameterDefinition[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "parameters must be a JSON array" };
  }

  const seenKeys = new Set<string>();
  const out: ParameterDefinition[] = [];

  for (let i = 0; i < raw.length; i++) {
    const element = raw[i];
    const where = `parameters[${i}]`;
    if (!isPlainObject(element)) {
      return { ok: false, error: `${where} must be an object` };
    }

    const key = element.key;
    if (typeof key !== "string" || key.trim() === "") {
      return { ok: false, error: `${where}.key is invalid` };
    }
    const trimmedKey = key.trim();
    if (seenKeys.has(trimmedKey)) {
      return { ok: false, error: `parameters has duplicate key "${trimmedKey}"` };
    }
    seenKeys.add(trimmedKey);

    const label = element.label;
    if (typeof label !== "string" || label.trim() === "") {
      return { ok: false, error: `${where}.label is invalid` };
    }

    const type = element.type;
    if (typeof type !== "string" || !parameterTypes.has(type)) {
      return { ok: false, error: `${where}.type is invalid` };
    }

    if (type === "knob") {
      let min = 0;
      let max = 10;
      if ("min" in element) {
        if (typeof element.min !== "number" || !Number.isInteger(element.min)) {
          return { ok: false, error: `${where}.min is invalid` };
        }
        min = element.min;
      }
      if ("max" in element) {
        if (typeof element.max !== "number" || !Number.isInteger(element.max)) {
          return { ok: false, error: `${where}.max is invalid` };
        }
        max = element.max;
      }
      if (min >= max) {
        return { ok: false, error: `${where}.min must be less than max` };
      }
      out.push({ key: trimmedKey, label: label.trim(), type: "knob", min, max });
      continue;
    }

    if (type === "switch") {
      out.push({ key: trimmedKey, label: label.trim(), type: "switch" });
      continue;
    }

    // selector
    const options = element.options;
    if (!Array.isArray(options) || options.length === 0) {
      return { ok: false, error: `${where}.options must be a non-empty array` };
    }
    const seenOptions = new Set<string>();
    const trimmedOptions: string[] = [];
    for (let j = 0; j < options.length; j++) {
      const opt = options[j];
      if (typeof opt !== "string" || opt.trim() === "") {
        return { ok: false, error: `${where}.options[${j}] is invalid` };
      }
      const trimmed = opt.trim();
      if (seenOptions.has(trimmed)) {
        return { ok: false, error: `${where}.options[${j}] is invalid` };
      }
      seenOptions.add(trimmed);
      trimmedOptions.push(trimmed);
    }
    out.push({ key: trimmedKey, label: label.trim(), type: "selector", options: trimmedOptions });
  }

  return { ok: true, value: out };
}

export function validateConfigAgainstParameters(
  config: Record<string, unknown>,
  defs: ParameterDefinition[],
): ParseResult<Record<string, unknown>> {
  const defsByKey = new Map(defs.map((d) => [d.key, d]));

  for (const key of Object.keys(config)) {
    const def = defsByKey.get(key);
    if (!def) {
      return { ok: false, error: `config key "${key}" is not a parameter of this pedal` };
    }
    const value = config[key];
    if (def.type === "knob") {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return { ok: false, error: `config value for "${key}" does not match its parameter definition` };
      }
      if (value < def.min || value > def.max) {
        return { ok: false, error: `config value for "${key}" does not match its parameter definition` };
      }
      continue;
    }
    if (def.type === "switch") {
      if (typeof value !== "boolean") {
        return { ok: false, error: `config value for "${key}" does not match its parameter definition` };
      }
      continue;
    }
    // selector
    if (typeof value !== "string" || !def.options.includes(value)) {
      return { ok: false, error: `config value for "${key}" does not match its parameter definition` };
    }
  }

  return { ok: true, value: config };
}