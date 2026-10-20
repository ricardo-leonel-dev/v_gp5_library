import { describe, expect, it } from 'vitest';
// @ts-expect-error - node types not in tsconfig
import { readFileSync } from 'fs';
// @ts-expect-error - node types not in tsconfig
import { join } from 'path';

// F36 R13 — every key path under the `songPedals` namespace must appear
// identically in `public/i18n/en.json` and `public/i18n/es.json`, each
// with a non-empty string value. Mirrors the helpers in
// `src/app/songs/i18n-parity.spec.ts`.

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

const REQUIRED_KEYS = [
  'songPedals.heading',
  'songPedals.attach_open',
  'songPedals.empty',
  'songPedals.pedal_unavailable',
  'songPedals.catalog_legend',
  'songPedals.catalog_empty',
  'songPedals.pedal_hint',
  'songPedals.label_field',
  'songPedals.label_placeholder',
  'songPedals.label_counter',
  'songPedals.attach',
  'songPedals.attaching',
  'songPedals.cancel',
  'songPedals.attached',
  'songPedals.detach',
  'songPedals.detach_aria',
  'songPedals.detach_confirm',
  'songPedals.detach_confirm_yes',
  'songPedals.detach_keep',
  'songPedals.detaching',
  'songPedals.detached',
  'songPedals.retry',
  'songPedals.login_again',
  'songPedals.errors.unreachable',
  'songPedals.errors.session_expired',
  'songPedals.errors.song_not_found',
  'songPedals.errors.load_failed',
  'songPedals.errors.catalog_failed',
  'songPedals.errors.label_required',
  'songPedals.errors.label_too_long',
  'songPedals.errors.pedal_gone',
  'songPedals.errors.attach_failed',
  'songPedals.errors.already_detached',
  'songPedals.errors.detach_failed',
];

describe('i18n parity under songPedals (F36 R13)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  it('en and es have identical leaf paths under songPedals', () => {
    const enPaths = leafPathsForNamespace(en, 'songPedals');
    const esPaths = leafPathsForNamespace(es, 'songPedals');
    expect(esPaths).toEqual(enPaths);
  });

  for (const lang of ['en', 'es'] as const) {
    it(`every songPedals leaf in ${lang} is a non-empty string`, () => {
      const json = lang === 'en' ? en : es;
      for (const path of leafPathsForNamespace(json, 'songPedals')) {
        const v = getLeafValue(json, path);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    });
  }

  it('every key listed in design.md "UI copy" is present in both languages', () => {
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      for (const key of REQUIRED_KEYS) {
        expect({ lang, key, type: typeof getLeafValue(json, key) }).toEqual({
          lang,
          key,
          type: 'string',
        });
      }
    }
  });
});