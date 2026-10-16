import { describe, expect, it } from 'vitest';
// @ts-expect-error - node types not in tsconfig
import { readFileSync } from 'fs';
// @ts-expect-error - node types not in tsconfig
import { join } from 'path';

// R40: public/i18n/en.json and public/i18n/es.json must contain the
// identical set of key paths under the `chainBoard` and `gp5Fx`
// namespaces, each with a non-empty string value.

interface JsonObject {
  readonly [key: string]: string | JsonObject;
}

function loadTranslations(lang: 'en' | 'es'): JsonObject {
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
  const path = join(cwd, 'public', 'i18n', `${lang}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
}

function collectLeafPaths(
  obj: JsonObject,
  prefix: string,
  leaves: string[],
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      leaves.push(path);
    } else {
      collectLeafPaths(value, path, leaves);
    }
  }
}

function leafPathsForNamespace(json: JsonObject, namespace: string): string[] {
  const ns = json[namespace];
  if (!ns || typeof ns !== 'object') {
    throw new Error(`namespace "${namespace}" missing or not an object`);
  }
  const leaves: string[] = [];
  collectLeafPaths(ns as JsonObject, namespace, leaves);
  return leaves.sort();
}

function getLeafValue(json: JsonObject, path: string): string | undefined {
  return path.split('.').reduce<string | JsonObject | undefined>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in acc) {
      return acc[segment];
    }
    return undefined;
  }, json) as string | undefined;
}

describe('i18n parity under chainBoard and gp5Fx (R40)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  for (const namespace of ['chainBoard', 'gp5Fx']) {
    it(`${namespace}: en and es have identical leaf paths`, () => {
      const enPaths = leafPathsForNamespace(en, namespace);
      const esPaths = leafPathsForNamespace(es, namespace);
      expect(esPaths).toEqual(enPaths);
    });

    it(`${namespace}: every leaf in en is a non-empty string`, () => {
      for (const path of leafPathsForNamespace(en, namespace)) {
        const v = getLeafValue(en, path);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    });

    it(`${namespace}: every leaf in es is a non-empty string`, () => {
      for (const path of leafPathsForNamespace(es, namespace)) {
        const v = getLeafValue(es, path);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    });
  }

  // R41: feature 17 v6 pins the chip-navigation + footnote keys on the
  // presetBrowser namespace. They are pin points so we cover them directly
  // instead of relying on a leaf-set comparison.
  for (const path of [
    'presetBrowser.deselect',
    'presetBrowser.export_label',
    'presetBrowser.mark_for_export',
    'presetBrowser.browse_presets',
    'presetBrowser.browse_presets_aria',
    'presetBrowser.presets_selected_count',
    'presetBrowser.footnote_unverified',
    'presetBrowser.load_test_presets',
  ]) {
    it(`${path}: en and es carry a non-empty string (R41)`, () => {
      const enValue = getLeafValue(en, path);
      const esValue = getLeafValue(es, path);
      expect(typeof enValue).toBe('string');
      expect((enValue as string).length).toBeGreaterThan(0);
      expect(typeof esValue).toBe('string');
      expect((esValue as string).length).toBeGreaterThan(0);
    });
  }
});