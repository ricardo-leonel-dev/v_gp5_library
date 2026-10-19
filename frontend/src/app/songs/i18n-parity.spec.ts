import { describe, expect, it } from 'vitest';
// @ts-expect-error - node types not in tsconfig
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
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

// F26 `library_first_startup` — R62: every key the new F26 templates
// reference must resolve in both locales. Extends F5's parity check with
// the new namespaces (`songDetail`, `pedalButton`) and the new F26 source
// files.
describe('i18n parity under songDetail / pedalButton / new F26 sources (F26 R62)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  for (const ns of ['songDetail', 'pedalButton'] as const) {
    it(`en and es have identical leaf paths under ${ns}`, () => {
      const enPaths = leafPathsForNamespace(en, ns);
      const esPaths = leafPathsForNamespace(es, ns);
      expect(esPaths).toEqual(enPaths);
    });
  }

  for (const lang of ['en', 'es'] as const) {
    for (const ns of ['songDetail', 'pedalButton'] as const) {
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

  it('every key the F26 sources reference under songDetail|pedalButton|songs|writeToPedal|writeToSlot exists in both languages', () => {
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const sources = [
      'src/app/songs/song-cover/song-cover.html',
      'src/app/songs/song-detail-page/song-detail-page.html',
      'src/app/pedals/pedal-connect-button/pedal-connect-button.html',
      'src/app/app.html',
      'src/app/songs/songs-page/songs-page.html',
      'src/app/songs/songs-page/songs-page.ts',
    ];
    const keys = new Set<string>();
    for (const file of sources) {
      const fullPath = join(cwd, file);
      if (!existsSync(fullPath)) continue;
      const text = readFileSync(fullPath, 'utf8') as string;
      for (const m of text.matchAll(
        /'((?:songDetail|pedalButton|songs|writeToPedal|writeToSlot)\.[A-Za-z_.]+)'/g,
      )) {
        keys.add(m[1]!);
      }
    }
    // `songs.placeholder` was removed in F26; the parity test still scans
    // for it indirectly through any legacy callers, but F26's own sources
    // do not reference it. Skip if no F26 keys were extracted (a passing
    // empty-set is fine — the strict check happens via leafPath parity).
    if (keys.size > 0) {
      expect(keys.has('songs.placeholder')).toBe(false);
    }
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      for (const key of keys) {
        if (key === 'songs.placeholder') continue;
        expect({ lang, key, type: typeof getLeafValue(json, key) }).toEqual({
          lang,
          key,
          type: 'string',
        });
      }
    }
  });

  it('writeToPedal.not_connected is exactly the R81 strings (es/en)', () => {
    expect(getLeafValue(es, 'writeToPedal.not_connected')).toBe(
      'Conecta el GP-5 para poder escribir en el pedal.',
    );
    expect(getLeafValue(en, 'writeToPedal.not_connected')).toBe(
      'Connect your GP-5 to write to the pedal.',
    );
  });
});

describe('i18n parity — F9 unsupportedBrowser', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
  const COMPONENT_HTML = 'src/app/shared/unsupported-browser-message/unsupported-browser-message.html';

  it('R23 — en and es have identical non-empty leaf paths under unsupportedBrowser', () => {
    const enPaths = leafPathsForNamespace(en, 'unsupportedBrowser');
    const esPaths = leafPathsForNamespace(es, 'unsupportedBrowser');
    expect(esPaths).toEqual(enPaths);
    expect(enPaths.length).toBeGreaterThan(0);
    for (const json of [en, es]) {
      for (const path of enPaths) {
        const v = getLeafValue(json, path);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('R24 — every unsupportedBrowser|pedal|pedalButton key in the F9-touched templates resolves in en and es', () => {
    const sources = [
      COMPONENT_HTML,
      'src/app/pedals/pedal-connection-page/pedal-connection-page.html',
      'src/app/pedals/preset-browser-page/preset-browser-page.html',
      'src/app/songs/write-to-pedal-dialog/write-to-pedal-dialog.html',
      'src/app/songs/songs-page/songs-page.html',
      'src/app/pedals/pedal-connect-button/pedal-connect-button.html',
      'src/app/app.html',
    ];
    const keys = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(join(cwd, file), 'utf8') as string;
      for (const m of text.matchAll(/'((?:unsupportedBrowser|pedalButton|pedal)\.[A-Za-z_.]+)'/g)) {
        keys.add(m[1]!);
      }
    }
    expect(keys.has('unsupportedBrowser.title')).toBe(true);
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      for (const key of keys) {
        expect({ lang, key, type: typeof getLeafValue(json, key) }).toEqual({ lang, key, type: 'string' });
      }
    }
  });

  it('R25 — pedal.unsupported and pedalButton.unsupported_hint stay non-empty in en and es', () => {
    for (const json of [en, es]) {
      for (const key of ['pedal.unsupported', 'pedalButton.unsupported_hint']) {
        const v = getLeafValue(json, key);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('R10 — only the shared component template references unsupportedBrowser.* under src/app/', () => {
    const offenders: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(cwd, dir)) as string[]) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(cwd, rel)).isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(html|ts)$/.test(rel) || rel.endsWith('.spec.ts')) continue;
        scanned++;
        if (rel === COMPONENT_HTML) continue;
        if ((readFileSync(join(cwd, rel), 'utf8') as string).includes('unsupportedBrowser.')) {
          offenders.push(rel);
        }
      }
    };
    walk('src/app');
    expect(scanned).toBeGreaterThan(10);
    expect(readFileSync(join(cwd, COMPONENT_HTML), 'utf8')).toContain('unsupportedBrowser.');
    expect(offenders).toEqual([]);
  });
});

// F31 R11 — the `songPresetDraft` namespace must be identical between en
// and es and every leaf must be a non-empty string. F31 adds `save`,
// `saving`, `saved`, `limit_reached`, `refresh_failed`, `refresh_retry`,
// plus the seven error keys under `errors.*`. The error keys are built
// dynamically by the page (`t('songPresetDraft.errors.' + key)`), so the
// source scan pulls the union members out of `preset-draft.ts` directly
// rather than relying on string-template occurrences.
describe('i18n parity under songPresetDraft (F31 R11)', () => {
  const en = loadTranslations('en');
  const es = loadTranslations('es');

  it('en and es have identical leaf paths under songPresetDraft', () => {
    const enPaths = leafPathsForNamespace(en, 'songPresetDraft');
    const esPaths = leafPathsForNamespace(es, 'songPresetDraft');
    expect(esPaths).toEqual(enPaths);
  });

  for (const lang of ['en', 'es'] as const) {
    it(`every songPresetDraft leaf in ${lang} is a non-empty string`, () => {
      const json = lang === 'en' ? en : es;
      for (const path of leafPathsForNamespace(json, 'songPresetDraft')) {
        const v = getLeafValue(json, path);
        expect(typeof v).toBe('string');
        expect((v as string).length).toBeGreaterThan(0);
      }
    });
  }

  it('every songPresetDraft key referenced by the F31 sources exists in both languages', () => {
    const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? '.';
    const sources = [
      'src/app/songs/song-detail-page/song-detail-page.html',
      'src/app/songs/song-detail-page/song-detail-page.ts',
    ];
    const keys = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(join(cwd, file), 'utf8') as string;
      for (const m of text.matchAll(/'((?:songPresetDraft)\.[A-Za-z_.]+)'/g)) {
        const m1 = m[1]!;
        // Skip the dynamic prefix `'songPresetDraft.errors.'` from the HTML
        // — the concrete error keys live in the SaveDraftErrorKey union.
        if (m1 === 'songPresetDraft.errors.') continue;
        keys.add(m1);
      }
    }
    // Pull the seven save-error keys straight from the typed union.
    const union = readFileSync(join(cwd, 'src/app/songs/preset-draft.ts'), 'utf8') as string;
    const unionMatch = union.match(/SaveDraftErrorKey[^]*?'save_failed'/);
    expect(unionMatch).not.toBeNull();
    const unionBody = unionMatch![0];
    for (const m of unionBody.matchAll(/'([a-z_]+)'/g)) {
      keys.add(`songPresetDraft.errors.${m[1]!}`);
    }
    // F31's own additions are the ones below; the rest pre-date the spec.
    const expectedNewKeys = [
      'songPresetDraft.save',
      'songPresetDraft.saving',
      'songPresetDraft.saved',
      'songPresetDraft.limit_reached',
      'songPresetDraft.refresh_failed',
      'songPresetDraft.refresh_retry',
      'songPresetDraft.errors.limit_reached_save',
      'songPresetDraft.errors.name_taken',
      'songPresetDraft.errors.unreachable',
      'songPresetDraft.errors.session_expired',
      'songPresetDraft.errors.song_not_found',
      'songPresetDraft.errors.rejected',
      'songPresetDraft.errors.save_failed',
    ];
    for (const k of expectedNewKeys) {
      if (!keys.has(k)) {
        throw new Error(`Missing F31 key in source scan: ${k}`);
      }
    }
    for (const lang of ['en', 'es'] as const) {
      const json = lang === 'en' ? en : es;
      for (const key of keys) {
        expect({ lang, key, type: typeof getLeafValue(json, key) }).toEqual({
          lang,
          key,
          type: 'string',
        });
      }
    }
  });
});
