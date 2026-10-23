import { describe, expect, test } from "bun:test";
import { getDb } from "../db/client";
import {
  createSongPedalConfig,
  listSongPedalConfigs,
  deleteSongPedalConfig,
  updateSongPedalConfig,
  SongPedalConfigError,
  type UpdateSongPedalConfigInput,
} from "./song-pedal-config-service";

async function makeUser(emailPrefix = "song-pedal"): Promise<{ userId: string }> {
  const db = getDb();
  const email = `${emailPrefix}-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
  `;
  return { userId: user.id };
}

async function seedSong(userId: string, name = "Test"): Promise<{ songId: string }> {
  const db = getDb();
  const [song] = await db<{ id: string }[]>`
    INSERT INTO songs (user_id, name) VALUES (${userId}, ${name}) RETURNING id
  `;
  return { songId: song.id };
}

async function seedPedal(name = "Test Pedal"): Promise<{ pedalId: string }> {
  const db = getDb();
  const [pedal] = await db<{ id: string }[]>`
    INSERT INTO pedal_catalog (name, brand, reference_image_key) VALUES (${name}, 'Test Brand', NULL) RETURNING id
  `;
  return { pedalId: pedal.id };
}

async function softDeleteSong(songId: string): Promise<void> {
  const db = getDb();
  await db`UPDATE songs SET deleted_at = NOW() WHERE id = ${songId}`;
}

async function softDeletePedal(pedalId: string): Promise<void> {
  const db = getDb();
  await db`UPDATE pedal_catalog SET deleted_at = NOW() WHERE id = ${pedalId}`;
}

async function directInsertConfig(
  songId: string,
  userId: string,
  pedalCatalogId: string,
  label = "Direct",
  config: Record<string, unknown> = {},
): Promise<{ configId: string }> {
  const db = getDb();
  const [row] = await db<{ id: string }[]>`
    INSERT INTO song_pedal_configs (song_id, user_id, pedal_catalog_id, label, config)
    VALUES (${songId}, ${userId}, ${pedalCatalogId}, ${label}, ${JSON.stringify(config)}::jsonb)
    RETURNING id
  `;
  return { configId: row.id };
}

// `config` reaches Postgres as a jsonb object or as a jsonb string holding the JSON text, depending
// on how the row was written; both are read back the same way the service reads them.
async function readConfig(configId: string): Promise<{
  config: Record<string, unknown>;
  updatedAt: string;
}> {
  const db = getDb();
  const [row] = await db<{ config: unknown; updated_at: unknown }[]>`
    SELECT config, updated_at FROM song_pedal_configs WHERE id = ${configId}
  `;
  return {
    config:
      typeof row.config === "string"
        ? (JSON.parse(row.config) as Record<string, unknown>)
        : (row.config as Record<string, unknown>),
    updatedAt: String(row.updated_at),
  };
}

async function seedTypedPedal(parameters: unknown): Promise<{ pedalId: string }> {
  const db = getDb();
  const [pedal] = await db<{ id: string }[]>`
    INSERT INTO pedal_catalog (name, brand, reference_image_key, parameters)
    VALUES (${`Typed-${crypto.randomUUID()}`}, 'Test Brand', NULL, ${JSON.stringify(parameters)}::jsonb)
    RETURNING id
  `;
  return { pedalId: pedal.id };
}

describe("song-pedal-config-service", () => {
  describe("createSongPedalConfig", () => {
    test("missing label -> SongPedalConfigError(400), no row inserted (R4)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
        }),
      ).rejects.toThrow(/label is required/);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("empty string label -> SongPedalConfigError(400), no row inserted (R4)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: "",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("missing pedalCatalogId -> SongPedalConfigError(400), no row inserted (R5)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, { label: "x" }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("syntactically invalid pedalCatalogId -> SongPedalConfigError(400), no row inserted (R5)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: "not-a-uuid",
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("nonexistent pedalCatalogId -> SongPedalConfigError(400), no row inserted (R5)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: crypto.randomUUID(),
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("soft-deleted pedalCatalogId -> SongPedalConfigError(400), no row inserted (R5)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      await softDeletePedal(pedalId);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("valid config object is stored as given (R6)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const result = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "Crunch",
        config: { gain: 7, tone: "bright", switches: { top: "on" } },
      });

      expect(result.config).toEqual({ gain: 7, tone: "bright", switches: { top: "on" } });

      const db = getDb();
      const [row] = await db<{ config: string }[]>`
        SELECT config FROM song_pedal_configs WHERE id = ${result.id}
      `;
      expect(JSON.parse(row.config)).toEqual({
        gain: 7,
        tone: "bright",
        switches: { top: "on" },
      });
    });

    test("non-object config (string/number/boolean/array/null) -> 400 (R7)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      for (const badConfig of ["text", 42, true, [1, 2, 3], null]) {
        await expect(
          createSongPedalConfig(userId, songId, {
            pedalCatalogId: pedalId,
            label: "x",
            config: badConfig,
          }),
        ).rejects.toBeInstanceOf(SongPedalConfigError);
      }
    });

    test("omitted config defaults to {} (R8)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const result = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "Stock",
      });

      expect(result.config).toEqual({});
      const db = getDb();
      const [row] = await db<{ config: string }[]>`
        SELECT config FROM song_pedal_configs WHERE id = ${result.id}
      `;
      expect(JSON.parse(row.config)).toEqual({});
    });

    test("valid input returns SongPedalConfigDto with expected fields; user_id matches caller (R1)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const result = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "My Crunch",
        config: { gain: 5 },
      });

      expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(result.songId).toBe(songId);
      expect(result.pedalCatalogId).toBe(pedalId);
      expect(result.label).toBe("My Crunch");
      expect(result.config).toEqual({ gain: 5 });
      expect(typeof result.createdAt).toBe("string");
      expect(typeof result.updatedAt).toBe("string");

      const db = getDb();
      const [row] = await db<{ user_id: string; label: string; pedal_catalog_id: string }[]>`
        SELECT user_id, label, pedal_catalog_id FROM song_pedal_configs WHERE id = ${result.id}
      `;
      expect(row.user_id).toBe(userId);
      expect(row.label).toBe("My Crunch");
      expect(row.pedal_catalog_id).toBe(pedalId);
    });

    test("nonexistent songId -> SongPedalConfigError(404), no row inserted (R3)", async () => {
      const { userId } = await makeUser();
      const { pedalId } = await seedPedal();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, crypto.randomUUID(), {
          pedalCatalogId: pedalId,
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("soft-deleted song -> SongPedalConfigError(404), no row inserted (R3)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      await softDeleteSong(songId);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("foreign-owned song -> SongPedalConfigError(404), no row inserted (R3)", async () => {
      const { userId: owner } = await makeUser("owner");
      const { userId: other } = await makeUser("other");
      const { songId } = await seedSong(owner);
      const { pedalId } = await seedPedal();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(other, songId, {
          pedalCatalogId: pedalId,
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("invalid songId UUID -> SongPedalConfigError(404), no row inserted (R2)", async () => {
      const { userId } = await makeUser();
      const { pedalId } = await seedPedal();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, "not-a-uuid", {
          pedalCatalogId: pedalId,
          label: "x",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });
  });

  describe("listSongPedalConfigs", () => {
    test("returns only the caller's own non-deleted rows for the song (R10)", async () => {
      const { userId: userAId } = await makeUser("list-A");
      const { userId: userBId } = await makeUser("list-B");
      const { songId: songA } = await seedSong(userAId, "Song A");
      const { songId: songB } = await seedSong(userBId, "Song B");
      const { pedalId } = await seedPedal();

      const aConfig = await createSongPedalConfig(userAId, songA, {
        pedalCatalogId: pedalId,
        label: "A config",
      });
      const { configId: softDeletedConfigId } = await directInsertConfig(
        songA,
        userAId,
        pedalId,
        "Will be deleted",
      );
      await createSongPedalConfig(userBId, songB, {
        pedalCatalogId: pedalId,
        label: "B config (different user, same pedal)",
      });

      const db = getDb();
      await db`UPDATE song_pedal_configs SET deleted_at = NOW() WHERE id = ${softDeletedConfigId}`;

      const listed = await listSongPedalConfigs(userAId, songA);
      const ids = listed.map((c) => c.id);
      expect(ids).toContain(aConfig.id);
      expect(ids).not.toContain(softDeletedConfigId);
      expect(listed).toHaveLength(1);
      expect(listed[0].label).toBe("A config");
    });

    test("rejects 404 for a song not owned by the caller (R11)", async () => {
      const { userId: owner } = await makeUser("list-owner");
      const { userId: other } = await makeUser("list-other");
      const { songId } = await seedSong(owner);

      await expect(listSongPedalConfigs(other, songId)).rejects.toBeInstanceOf(SongPedalConfigError);
    });

    test("invalid songId UUID -> 404 (R2)", async () => {
      const { userId } = await makeUser();
      await expect(listSongPedalConfigs(userId, "not-a-uuid")).rejects.toBeInstanceOf(
        SongPedalConfigError,
      );
    });
  });

  describe("deleteSongPedalConfig", () => {
    test("sets deleted_at on a row it owns; subsequent list excludes it (R12)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const created = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "To delete",
      });

      await deleteSongPedalConfig(userId, songId, created.id);

      const db = getDb();
      const [row] = await db<{ deleted_at: string | null }[]>`
        SELECT deleted_at FROM song_pedal_configs WHERE id = ${created.id}
      `;
      expect(row.deleted_at).not.toBeNull();

      const listed = await listSongPedalConfigs(userId, songId);
      expect(listed.map((c) => c.id)).not.toContain(created.id);
    });

    test("nonexistent configId -> 404, no rows modified (R13)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);

      await expect(
        deleteSongPedalConfig(userId, songId, crypto.randomUUID()),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
    });

    test("already soft-deleted configId -> 404 (R13)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      const { configId } = await directInsertConfig(songId, userId, pedalId);
      const db = getDb();
      await db`UPDATE song_pedal_configs SET deleted_at = NOW() WHERE id = ${configId}`;

      await expect(deleteSongPedalConfig(userId, songId, configId)).rejects.toBeInstanceOf(
        SongPedalConfigError,
      );
    });

    test("configId belonging to a different song -> 404 (R13)", async () => {
      const { userId } = await makeUser();
      const { songId: songA } = await seedSong(userId, "Song A");
      const { songId: songB } = await seedSong(userId, "Song B");
      const { pedalId } = await seedPedal();
      const { configId } = await directInsertConfig(songA, userId, pedalId);

      await expect(deleteSongPedalConfig(userId, songB, configId)).rejects.toBeInstanceOf(
        SongPedalConfigError,
      );

      const db = getDb();
      const [row] = await db<{ deleted_at: string | null }[]>`
        SELECT deleted_at FROM song_pedal_configs WHERE id = ${configId}
      `;
      expect(row.deleted_at).toBeNull();
    });

    test("configId owned by a different user -> 404 (R13)", async () => {
      const { userId: owner } = await makeUser("del-owner");
      const { userId: other } = await makeUser("del-other");
      const { songId: ownerSong } = await seedSong(owner, "Owner Song");
      const { songId: otherSong } = await seedSong(other, "Other Song");
      const { pedalId } = await seedPedal();
      const { configId } = await directInsertConfig(ownerSong, owner, pedalId);

      await expect(deleteSongPedalConfig(other, otherSong, configId)).rejects.toBeInstanceOf(
        SongPedalConfigError,
      );

      const db = getDb();
      const [row] = await db<{ deleted_at: string | null }[]>`
        SELECT deleted_at FROM song_pedal_configs WHERE id = ${configId}
      `;
      expect(row.deleted_at).toBeNull();
    });

    test("invalid songId UUID -> 404 (R2)", async () => {
      const { userId } = await makeUser();
      await expect(
        deleteSongPedalConfig(userId, "not-a-uuid", crypto.randomUUID()),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
    });

    test("invalid configId UUID -> 404 (R2)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      await expect(
        deleteSongPedalConfig(userId, songId, "not-a-uuid"),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
    });
  });

  describe("updateSongPedalConfig", () => {
    const defs = [
      { key: "gain", label: "Gain", type: "knob", min: 0, max: 10 },
      { key: "boost", label: "Boost", type: "switch" },
      { key: "mode", label: "Mode", type: "selector", options: ["A", "B"] },
    ];
    const stored = { gain: 5, boost: true, mode: "A" };

    async function seedPatchCase(
      emailPrefix: string,
    ): Promise<{ userId: string; songId: string; configId: string; pedalId: string }> {
      const { userId } = await makeUser(emailPrefix);
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedTypedPedal(defs);
      const { configId } = await directInsertConfig(songId, userId, pedalId, "Lead", stored);
      return { userId, songId, configId, pedalId };
    }

    async function readPedal(pedalId: string): Promise<Record<string, unknown>> {
      const [row] = await getDb()<{ is_editable: boolean; parameters: unknown; updated_at: unknown }[]>`
        SELECT is_editable, parameters, updated_at FROM pedal_catalog WHERE id = ${pedalId}
      `;
      return {
        is_editable: row.is_editable,
        parameters: row.parameters,
        updatedAt: String(row.updated_at),
      };
    }

    test("a, b, c, g: sent keys overwrite or are added, unsent keys and the row count survive (R1)", async () => {
      const cases: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
        ["a-one-key", { gain: 3 }, { gain: 3, boost: true, mode: "A" }],
        ["b-every-key", { gain: 8, boost: false, mode: "B" }, { gain: 8, boost: false, mode: "B" }],
        ["c-no-op", {}, { gain: 5, boost: true, mode: "A" }],
      ];
      for (const [label, config, expected] of cases) {
        const { userId, songId, configId } = await seedPatchCase(`r1-${label}`);
        const db = getDb();
        const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;

        const dto = await updateSongPedalConfig(userId, songId, configId, { config });

        expect(dto.id).toBe(configId);
        expect(dto.config).toEqual(expected);
        expect((await readConfig(configId)).config).toEqual(expected);

        const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        expect(after[0].c).toBe(before[0].c);
      }
    });

    test("d: label and pedal_catalog_id in the body are ignored (R1 d)", async () => {
      const { userId, songId, configId, pedalId } = await seedPatchCase("r1-d");
      const { pedalId: otherPedalId } = await seedPedal();

      const dto = await updateSongPedalConfig(userId, songId, configId, {
        config: { gain: 1 },
        label: "X",
        pedal_catalog_id: otherPedalId,
      } as UpdateSongPedalConfigInput);

      expect(dto.config).toEqual({ gain: 1, boost: true, mode: "A" });
      expect(dto.label).toBe("Lead");
      expect(dto.pedalCatalogId).toBe(pedalId);
    });

    test("e: updatedAt moves to now; id and createdAt do not move (R1 e)", async () => {
      const { userId, songId, configId } = await seedPatchCase("r1-e");
      const db = getDb();
      await db`UPDATE song_pedal_configs SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = ${configId}`;
      const [before] = await db<{ created_at: unknown; updated_at: unknown }[]>`
        SELECT created_at, updated_at FROM song_pedal_configs WHERE id = ${configId}
      `;

      const dto = await updateSongPedalConfig(userId, songId, configId, { config: { gain: 7 } });

      expect(dto.id).toBe(configId);
      expect(dto.createdAt).toBe(String(before.created_at));
      expect(new Date(dto.updatedAt).getTime()).toBeGreaterThan(
        new Date(String(before.updated_at)).getTime(),
      );
    });

    test("h: a zero-parameter pedal merges any key, null included (R1 h)", async () => {
      const { userId } = await makeUser("r1-h");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      const { configId } = await directInsertConfig(songId, userId, pedalId, "Legacy", {
        a: 1,
        b: 2,
      });

      const dto = await updateSongPedalConfig(userId, songId, configId, {
        config: { b: 3, c: null },
      });

      expect(dto.config).toEqual({ a: 1, b: 3, c: null });
      expect((await readConfig(configId)).config).toEqual({ a: 1, b: 3, c: null });
    });

    test("a: in-range values for every parameter type are accepted (R2 a)", async () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ["knob-min", { gain: 0 }],
        ["knob-max", { gain: 10 }],
        ["switch", { boost: false }],
        ["selector", { mode: "B" }],
      ];
      for (const [label, config] of cases) {
        const { userId, songId, configId } = await seedPatchCase(`r2-${label}`);

        const dto = await updateSongPedalConfig(userId, songId, configId, { config });

        expect(dto.config).toEqual({ ...stored, ...config });
      }
    });

    test("b-g: a bad or unknown sent key -> 400 and the row keeps its config and updated_at (R2 b-h)", async () => {
      const valueError = (key: string) =>
        `config value for "${key}" does not match its parameter definition`;
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ["b-knob-low", { gain: -1 }, valueError("gain")],
        ["b-knob-high", { gain: 11 }, valueError("gain")],
        ["c-knob-float", { gain: 7.5 }, valueError("gain")],
        ["c-knob-string", { gain: "5" }, valueError("gain")],
        ["c-knob-boolean", { gain: true }, valueError("gain")],
        ["c-knob-null", { gain: null }, valueError("gain")],
        ["d-switch-string", { boost: "on" }, valueError("boost")],
        ["d-switch-number", { boost: 1 }, valueError("boost")],
        ["d-switch-null", { boost: null }, valueError("boost")],
        ["e-selector-unknown", { mode: "C" }, valueError("mode")],
        ["e-selector-case", { mode: "a" }, valueError("mode")],
        ["e-selector-number", { mode: 0 }, valueError("mode")],
        ["e-selector-null", { mode: null }, valueError("mode")],
        ["f-unknown-key", { unknown: 1 }, 'config key "unknown" is not a parameter of this pedal'],
        [
          "g-valid-plus-unknown",
          { gain: 3, unknown: 1 },
          'config key "unknown" is not a parameter of this pedal',
        ],
      ];
      for (const [label, config, message] of cases) {
        const { userId, songId, configId } = await seedPatchCase(`r2-${label}`);
        const before = await readConfig(configId);

        await expect(
          updateSongPedalConfig(userId, songId, configId, { config }),
        ).rejects.toMatchObject({ status: 400, message });

        expect(await readConfig(configId)).toEqual(before);
      }
    });

    test("c, d: a missing or non-object config -> 400 and the row is untouched (R3 c, d)", async () => {
      const cases: Array<[string, unknown]> = [
        ["c-missing", undefined],
        ["d-array", []],
        ["d-string", "text"],
        ["d-number", 5],
        ["d-null", null],
      ];
      for (const [label, config] of cases) {
        const { userId, songId, configId } = await seedPatchCase(`r3-${label}`);
        const before = await readConfig(configId);

        await expect(
          updateSongPedalConfig(userId, songId, configId, { config }),
        ).rejects.toMatchObject({ status: 400, message: "config must be a JSON object" });

        expect(await readConfig(configId)).toEqual(before);
      }
    });

    test("e: a zero-parameter pedal accepts any JSON object as config (R3 e)", async () => {
      const { userId } = await makeUser("r3-e");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();
      const { configId } = await directInsertConfig(songId, userId, pedalId, "Legacy", { kept: 1 });

      const dto = await updateSongPedalConfig(userId, songId, configId, {
        config: { anything: "goes", n: 42 },
      });

      expect(dto.config).toEqual({ kept: 1, anything: "goes", n: 42 });
    });

    test("f, h: a legacy partial row that stays incomplete -> 400 naming the missing keys (R6 f, h)", async () => {
      const cases: Array<[string, Record<string, unknown>, Record<string, unknown>, string]> = [
        [
          "f-partial-gain-only",
          { gain: 5 },
          { gain: 3 },
          'config is missing parameters: "boost", "mode"',
        ],
        ["h-empty", {}, {}, 'config is missing parameters: "gain", "boost", "mode"'],
      ];
      for (const [label, storedConfig, config, message] of cases) {
        const { userId } = await makeUser(`r6-${label}`);
        const { songId } = await seedSong(userId);
        const { pedalId } = await seedTypedPedal(defs);
        const { configId } = await directInsertConfig(songId, userId, pedalId, "Legacy", storedConfig);
        const before = await readConfig(configId);

        await expect(
          updateSongPedalConfig(userId, songId, configId, { config }),
        ).rejects.toMatchObject({ status: 400, message });

        expect(await readConfig(configId)).toEqual(before);
      }
    });

    test("g: sending the missing keys of a legacy partial row completes it (R6 g)", async () => {
      const { userId } = await makeUser("r6-g");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedTypedPedal(defs);
      const { configId } = await directInsertConfig(songId, userId, pedalId, "Legacy", { gain: 5 });

      const dto = await updateSongPedalConfig(userId, songId, configId, {
        config: { boost: true, mode: "B" },
      });

      expect(dto.config).toEqual({ gain: 5, boost: true, mode: "B" });
      expect((await readConfig(configId)).config).toEqual({ gain: 5, boost: true, mode: "B" });
    });

    test("b: a malformed songId or configId -> 404 (R4 b)", async () => {
      const { userId, songId, configId } = await seedPatchCase("r4-b");

      await expect(
        updateSongPedalConfig(userId, "not-a-uuid", configId, { config: { gain: 3 } }),
      ).rejects.toMatchObject({ status: 404, message: "song pedal config not found" });
      await expect(
        updateSongPedalConfig(userId, songId, "not-a-uuid", { config: { gain: 3 } }),
      ).rejects.toMatchObject({ status: 404, message: "song pedal config not found" });

      expect((await readConfig(configId)).config).toEqual(stored);
    });

    test("c-g: anything but a live config of a live song the requester owns -> 404 (R4 c-g)", async () => {
      const scenarios: Array<
        [string, () => Promise<{ userId: string; songId: string; configId: string; watchId: string | null }>]
      > = [
        [
          "c-song-does-not-exist",
          async () => {
            const { userId, configId } = await seedPatchCase("r4-c");
            return { userId, songId: crypto.randomUUID(), configId, watchId: configId };
          },
        ],
        [
          "d-song-soft-deleted",
          async () => {
            const { userId, songId, configId } = await seedPatchCase("r4-d");
            await softDeleteSong(songId);
            return { userId, songId, configId, watchId: configId };
          },
        ],
        [
          "e-other-users-song",
          async () => {
            const { userId: ownerId, songId, configId } = await seedPatchCase("r4-e");
            const { userId: otherId } = await makeUser("r4-e-other");
            expect(ownerId).not.toBe(otherId);
            return { userId: otherId, songId, configId, watchId: configId };
          },
        ],
        [
          "f-config-does-not-exist",
          async () => {
            const { userId, songId } = await seedPatchCase("r4-f");
            return { userId, songId, configId: crypto.randomUUID(), watchId: null };
          },
        ],
        [
          "g-config-soft-deleted",
          async () => {
            const { userId, songId, configId } = await seedPatchCase("r4-g");
            await getDb()`UPDATE song_pedal_configs SET deleted_at = NOW() WHERE id = ${configId}`;
            return { userId, songId, configId, watchId: configId };
          },
        ],
      ];

      for (const [label, setup] of scenarios) {
        const { userId, songId, configId, watchId } = await setup();
        const before = watchId === null ? null : await readConfig(watchId);

        await expect(
          updateSongPedalConfig(userId, songId, configId, { config: { gain: 3 } }),
        ).rejects.toMatchObject({ status: 404, message: "song pedal config not found" });

        if (watchId !== null) {
          expect(`${label}:${JSON.stringify(await readConfig(watchId))}`).toBe(
            `${label}:${JSON.stringify(before)}`,
          );
        }
      }
    });

    test("h: a config row of another song of the same requester -> 404, row unchanged (R4 h)", async () => {
      const { userId, configId } = await seedPatchCase("r4-h");
      const { songId: otherSongId } = await seedSong(userId, "Other Song");
      const before = await readConfig(configId);

      await expect(
        updateSongPedalConfig(userId, otherSongId, configId, { config: { gain: 3 } }),
      ).rejects.toMatchObject({ status: 404, message: "song pedal config not found" });

      expect(await readConfig(configId)).toEqual(before);
    });

    test("i: a foreign row with an invalid config is still 404, not 400 (R4 i)", async () => {
      const { songId, configId } = await seedPatchCase("r4-i");
      const { userId: otherId } = await makeUser("r4-i-other");
      const before = await readConfig(configId);

      await expect(
        updateSongPedalConfig(otherId, songId, configId, { config: { gain: 99 } }),
      ).rejects.toMatchObject({ status: 404, message: "song pedal config not found" });

      expect(await readConfig(configId)).toEqual(before);
    });

    test("a: a locked catalog pedal still takes the update (R5 a)", async () => {
      const { userId, songId, configId, pedalId } = await seedPatchCase("r5-locked");
      await getDb()`UPDATE pedal_catalog SET is_editable = false WHERE id = ${pedalId}`;
      const pedalBefore = await readPedal(pedalId);

      const ok = await updateSongPedalConfig(userId, songId, configId, { config: { gain: 2 } });
      expect(ok.config).toEqual({ gain: 2, boost: true, mode: "A" });

      await expect(
        updateSongPedalConfig(userId, songId, configId, { config: { gain: 99 } }),
      ).rejects.toMatchObject({ status: 400 });

      expect(await readPedal(pedalId)).toEqual(pedalBefore);
    });

    test("b: a pedal attached to two users' songs still takes the update, catalog row untouched (R5 b, c)", async () => {
      const { userId, songId, configId, pedalId } = await seedPatchCase("r5-shared");
      const { userId: otherId } = await makeUser("r5-shared-other");
      const { songId: otherSongId } = await seedSong(otherId, "Other Song");
      await directInsertConfig(otherSongId, otherId, pedalId, "Other user's row", stored);
      const pedalBefore = await readPedal(pedalId);

      const dto = await updateSongPedalConfig(userId, songId, configId, {
        config: { mode: "B" },
      });

      expect(dto.config).toEqual({ gain: 5, boost: true, mode: "B" });
      expect(await readPedal(pedalId)).toEqual(pedalBefore);
    });
  });

  describe("config vs typed pedal definitions (R5)", () => {
    const defs = [
      { key: "gain", label: "Gain", type: "knob", min: 0, max: 10 },
      { key: "boost", label: "Boost", type: "switch" },
      { key: "mode", label: "Mode", type: "selector", options: ["A", "B"] },
    ];

    test("in-range complete configs pass and are stored as sent (R6 a)", async () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ["a-gain", { gain: 5, boost: true, mode: "A" }],
        ["d-boost", { gain: 8, boost: false, mode: "B" }],
        ["f-mode", { gain: 0, boost: true, mode: "A" }],
        ["i-empty", { gain: 10, boost: false, mode: "B" }],
      ];
      for (const [label, config] of cases) {
        const { userId } = await makeUser(`r5-${label}`);
        const { songId } = await seedSong(userId);
        const { pedalId } = await seedTypedPedal(defs);
        const db = getDb();
        const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        const result = await createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: `Config ${label}`,
          config,
        });
        expect(result.config).toEqual(config);
        const [row] = await db<{ config: string }[]>`
          SELECT config FROM song_pedal_configs WHERE id = ${result.id}
        `;
        expect(JSON.parse(row.config)).toEqual(config);
        const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        expect(after[0].c).toBe(before[0].c + 1);
      }
    });

    test("config omitted on a typed pedal -> 400 listing every key, no row inserted (R6 c)", async () => {
      const { userId } = await makeUser("r5-i-omitted");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedTypedPedal(defs);
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: "Config omitted",
        }),
      ).rejects.toMatchObject({
        status: 400,
        message: 'config is missing parameters: "gain", "boost", "mode"',
      });
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("b, c, d: a partial or empty config -> 400 naming the missing keys, no row inserted (R6)", async () => {
      const cases: Array<[string, Record<string, unknown>, string]> = [
        ["b-partial", { gain: 5 }, 'config is missing parameters: "boost", "mode"'],
        ["c-empty", {}, 'config is missing parameters: "gain", "boost", "mode"'],
        [
          "d-out-of-range",
          { gain: 11 },
          'config value for "gain" does not match its parameter definition',
        ],
      ];
      for (const [label, config, message] of cases) {
        const { userId } = await makeUser(`r6-${label}`);
        const { songId } = await seedSong(userId);
        const { pedalId } = await seedTypedPedal(defs);
        const db = getDb();
        const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        await expect(
          createSongPedalConfig(userId, songId, {
            pedalCatalogId: pedalId,
            label: `Config ${label}`,
            config,
          }),
        ).rejects.toMatchObject({ status: 400, message });
        const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        expect(after[0].c).toBe(before[0].c);
      }
    });

    test("e: a zero-parameter pedal still accepts {} and an omitted config (R6 e)", async () => {
      const { userId } = await makeUser("r6-e");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const empty = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "Empty",
        config: {},
      });
      expect(empty.config).toEqual({});

      const omitted = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "Omitted",
      });
      expect(omitted.config).toEqual({});
    });

    test("b, c, e, g, h, j: invalid values -> 400, no row inserted", async () => {
      const cases: Array<[string, Record<string, unknown>]> = [
        ["b-gain11", { gain: 11 }],
        ["c-gain75", { gain: 7.5 }],
        ["e-boost", { boost: "on" }],
        ["g-mode", { mode: "C" }],
        ["h-unknown", { unknown: 1 }],
        ["j-mixed", { gain: 5, unknown: 1 }],
      ];
      for (const [label, config] of cases) {
        const { userId } = await makeUser(`r5bad-${label}`);
        const { songId } = await seedSong(userId);
        const { pedalId } = await seedTypedPedal(defs);
        const db = getDb();
        const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        await expect(
          createSongPedalConfig(userId, songId, {
            pedalCatalogId: pedalId,
            label: `Config ${label}`,
            config,
          }),
        ).rejects.toBeInstanceOf(SongPedalConfigError);
        const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM song_pedal_configs`;
        expect(after[0].c).toBe(before[0].c);
      }
    });
  });

  describe("legacy pedal keeps free-form config (R6)", () => {
    test("a, b: any JSON object is stored; non-object -> 400", async () => {
      const { userId } = await makeUser("r6");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedPedal();

      const result = await createSongPedalConfig(userId, songId, {
        pedalCatalogId: pedalId,
        label: "Free form",
        config: { anything: "goes", n: 42 },
      });
      expect(result.config).toEqual({ anything: "goes", n: 42 });

      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          label: "Not an object",
          config: "text",
        }),
      ).rejects.toBeInstanceOf(SongPedalConfigError);
    });
  });

  describe("ownership and label errors win over a config mismatch (P2)", () => {
    const typedDefs = [{ key: "gain", label: "Gain", type: "knob", min: 0, max: 10 }];

    test("foreign song + invalid config -> 404 song not found", async () => {
      const { userId: owner } = await makeUser("p2-owner");
      const { userId: other } = await makeUser("p2-other");
      const { songId } = await seedSong(owner);
      const { pedalId } = await seedTypedPedal(typedDefs);
      await expect(
        createSongPedalConfig(other, songId, {
          pedalCatalogId: pedalId,
          label: "x",
          config: { gain: 99 },
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    test("missing label + invalid config -> 400 label is required", async () => {
      const { userId } = await makeUser("p2-label");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedTypedPedal(typedDefs);
      await expect(
        createSongPedalConfig(userId, songId, {
          pedalCatalogId: pedalId,
          config: { gain: 99 },
        }),
      ).rejects.toMatchObject({ status: 400, message: "label is required" });
    });
  });

  describe("stored configs are not re-validated on list (P3)", () => {
    test("a config that violates its typed pedal's definitions is returned as stored", async () => {
      const { userId } = await makeUser("p3");
      const { songId } = await seedSong(userId);
      const { pedalId } = await seedTypedPedal([
        { key: "gain", label: "Gain", type: "knob", min: 0, max: 10 },
      ]);
      const [direct] = await getDb()<{ id: string }[]>`
        INSERT INTO song_pedal_configs (song_id, user_id, pedal_catalog_id, label, config)
        VALUES (${songId}, ${userId}, ${pedalId}, 'Old freeform', ${JSON.stringify({ gain: 99 })}::jsonb)
        RETURNING id
      `;

      const listed = await listSongPedalConfigs(userId, songId);
      const row = listed.find((c) => c.id === direct.id);
      expect(row).toBeDefined();
      expect(row!.config).toEqual({ gain: 99 });
    });
  });
});