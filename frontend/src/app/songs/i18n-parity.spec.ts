import { describe, expect, it } from 'vitest';
// @ts-expect-error - node types not in tsconfig
import { readFileSync } from 'fs';
// @ts-expect-error - node types not in tsconfig
import { join } from 'path';

// R105: every key path under the `saveSong` namespace must appear identically
// in `public/i18n/en.json` and `public/i18n/es.json`, each with a non-empty
// string value. Mirrors the helpers in `src/app/pedals/i18n-parity.spec.ts`.

interface JsonObject {
  readonly [key: string]: string | JsonObject;
}

function loadTranslations(lang: 'en' | 'es'): JsonObject {
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
  const path = join(cwd, 'public', 'i18n', `${lang}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
}

function collectLeafPaths(obj: JsonObject, prefix: string, leaves: string[]): void {
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

describe('i18n parity under saveSong (R105)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  it('en and es have identical leaf paths under saveSong', () => {
    const enPaths = leafPathsForNamespace(en, 'saveSong');
    const esPaths = leafPathsForNamespace(es, 'saveSong');
    expect(esPaths).toEqual(enPaths);
  });

  it('every saveSong leaf in en is a non-empty string', () => {
    for (const path of leafPathsForNamespace(en, 'saveSong')) {
      const v = getLeafValue(en, path);
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  it('every saveSong leaf in es is a non-empty string', () => {
    for (const path of leafPathsForNamespace(es, 'saveSong')) {
      const v = getLeafValue(es, path);
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  it('chainBoard.userIrSlot and chainBoard.userSnapToneSlot are present (slot labels reused)', () => {
    expect(typeof getLeafValue(en, 'chainBoard.userIrSlot')).toBe('string');
    expect(typeof getLeafValue(en, 'chainBoard.userSnapToneSlot')).toBe('string');
  });
});

// F5 `import_preset_to_pedal` — R50: writeToPedal + writeToSlot namespaces
// (and the two new songs.card.* keys) must be identical between en and es
// and every leaf must be a non-empty string.
describe('i18n parity under writeToPedal / writeToSlot / songs.card (F5 R50)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  for (const ns of ['writeToPedal', 'writeToSlot'] as const) {
    it(`en and es have identical leaf paths under ${ns}`, () => {
      const enPaths = leafPathsForNamespace(en, ns);
      const esPaths = leafPathsForNamespace(es, ns);
      expect(esPaths).toEqual(enPaths);
    });
  }

  for (const lang of ['en', 'es'] as const) {
    for (const ns of ['writeToPedal', 'writeToSlot'] as const) {
      it(`every ${ns} leaf in ${lang} is a non-empty string`, () => {
        const json = lang === 'en' ? en : es;
        for (const path of leafPathsForNamespace(json, ns)) {
          const v = getLeafValue(json, path);
          expect(typeof v).toBe('string');
          expect((v as string).length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('songs.card.send_to_pedal and songs.card.send_to_pedal_aria are present in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      expect(typeof getLeafValue(json, 'songs.card.send_to_pedal')).toBe('string');
      expect(typeof getLeafValue(json, 'songs.card.send_to_pedal_aria')).toBe('string');
    }
  });

  // Every literal key the F5 templates/helpers pass to `t(...)` must resolve
  // in both locales (review 2026-10-07: `writeToSlot.summary_range` was
  // referenced by the dialog but missing from both JSON files).
  it('every writeToPedal / writeToSlot / songs key referenced by the F5 sources exists in both languages', () => {
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const sources = [
      'src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.html',
      'src/app/songs/songs-page/songs-page.html',
      'src/app/songs/songs-page/songs-page.ts',
      'src/app/songs/write-preset-form.ts',
    ];
    const keys = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(join(cwd, file), 'utf8') as string;
      for (const m of text.matchAll(/'((?:writeToPedal|writeToSlot|songs)\.[A-Za-z_.]+)'/g)) {
        keys.add(m[1]!);
      }
    }
    expect(keys.has('writeToSlot.summary_range')).toBe(true);
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      for (const key of keys) {
        expect({ lang, key, type: typeof getLeafValue(json, key) }).toEqual({ lang, key, type: 'string' });
      }
    }
  });

  it('writeToPedal.connect and writeToPedal.connecting are present in both languages (patch 2026-10-06)', () => {
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      const connect = getLeafValue(json, 'writeToPedal.connect');
      const connecting = getLeafValue(json, 'writeToPedal.connecting');
      expect(typeof connect).toBe('string');
      expect((connect as string).length).toBeGreaterThan(0);
      expect(typeof connecting).toBe('string');
      expect((connecting as string).length).toBeGreaterThan(0);
    }
  });
});