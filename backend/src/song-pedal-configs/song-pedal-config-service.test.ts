import { describe, expect, test } from "bun:test";
import { getDb } from "../db/client";
import {
  createSongPedalConfig,
  listSongPedalConfigs,
  deleteSongPedalConfig,
  SongPedalConfigError,
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
    INSERT INTO pedal_catalog (name, reference_image_key) VALUES (${name}, NULL) RETURNING id
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
): Promise<{ configId: string }> {
  const db = getDb();
  const [row] = await db<{ id: string }[]>`
    INSERT INTO song_pedal_configs (song_id, user_id, pedal_catalog_id, label)
    VALUES (${songId}, ${userId}, ${pedalCatalogId}, ${label})
    RETURNING id
  `;
  return { configId: row.id };
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
});