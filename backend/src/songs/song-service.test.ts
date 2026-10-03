import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db/client";
import { issueToken } from "../auth/jwt";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import {
  createSong,
  deleteSong,
  getSongById,
  getSongFile,
  isUuid,
  listSongs,
  MAX_EXTRA_CONFIG_BYTES,
  SongError,
  type CreateSongInput,
  type UploadedFile,
} from "./song-service";
import { loadFixture, PRESET_FIXTURES } from "./fixtures";
import { PlanLimitError, type Plan, type PlanLimitCode } from "../plans/plan-service";
import app from "../index";

const fixtureBytes = await Promise.all(PRESET_FIXTURES.map((f) => loadFixture(f.file)));

function file(name: string, bytes: number[]): UploadedFile {
  return { filename: name, mimeType: "application/octet-stream", bytes: new Uint8Array(bytes) };
}

function presetFile(index = 0, filename = "preset.prst"): UploadedFile {
  return {
    filename,
    mimeType: "application/octet-stream",
    bytes: new Uint8Array(fixtureBytes[index]!),
  };
}

async function countStoredObjects(root: string): Promise<number> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).length;
}

const presetDtoKeys = [
  "byteSize",
  "createdAt",
  "id",
  "mimeType",
  "name",
  "originalFilename",
  "sortOrder",
];

async function makeUser(emailPrefix = "song-cru", plan: Plan = "premium"):
  Promise<{ userId: string; token: string }> {
  const db = getDb();
  const email = `${emailPrefix}-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash, plan) VALUES (${email}, 'x', ${plan}) RETURNING id
  `;
  const token = await issueToken(user.id, plan);
  return { userId: user.id, token };
}

async function seedSong(
  userId: string,
  override: Partial<CreateSongInput> = {},
): Promise<{ songId: string; storage: LocalFsStorageAdapter; dir: string }> {
  const db = getDb();
  const dir = await mkdtemp(path.join(os.tmpdir(), "song-cru-"));
  const storage = new LocalFsStorageAdapter(dir);
  const input: CreateSongInput = {
    name: "Test",
    preset: [presetFile()],
    ir: [],
    nam: [],
    cover: [],
    ...override,
  };
  const result = await createSong(userId, input, storage);
  const [songRow] = await db<{ id: string }[]>`SELECT id FROM songs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1`;
  return { songId: songRow.id, storage, dir };
}

describe("song-service", () => {
  let dir: string;
  let storage: LocalFsStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "song-cru-"));
    storage = new LocalFsStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("createSong", () => {
    test("valid preset + artist + extraConfig returns SongWithFilesDto with bytes round-tripped (song_crud_api R1, R6, R8, R11, R13; multiple_presets_per_song R15, R19, R23, R25)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      const preset = presetFile();

      const result = await createSong(
        userId,
        {
          name: "My Song",
          artist: "An Artist",
          extraConfig: '{"gain":1,"tone":"bright"}',
          preset: [preset],
          ir: [],
          nam: [],
          cover: [],
        },
        storage,
      );

      expect(result.name).toBe("My Song");
      expect(result.artist).toBe("An Artist");
      expect(result).not.toHaveProperty("pedalPresetName");
      expect(result.extraConfig).toEqual({ gain: 1, tone: "bright" });
      expect(result.files).toHaveLength(0);
      expect(result.presets).toHaveLength(1);
      expect(result.presets[0]!.name).toBe(PRESET_FIXTURES[0].name);
      expect(result.presets[0]!.originalFilename).toBe("preset.prst");
      expect(result.presets[0]!.mimeType).toBe("application/octet-stream");
      expect(result.presets[0]!.byteSize).toBe(507);
      expect(result.presets[0]!.sortOrder).toBe(0);

      const [songDbRow] = await db<{ extra_config: string }[]>`
        SELECT extra_config FROM songs WHERE id = ${result.id}
      `;
      expect(JSON.parse(songDbRow.extra_config)).toEqual({ gain: 1, tone: "bright" });

      const fileRows = await db<{ storage_key: string }[]>`
        SELECT storage_key FROM song_files WHERE song_id = ${result.id} AND kind = 'preset'
      `;
      const bytes = await storage.get(fileRows[0].storage_key);
      expect(bytes).toEqual(preset.bytes);
    });

    test("omitting artist / extraConfig stores null / {} (song_crud_api R10, R12; multiple_presets_per_song R25)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const result = await createSong(
        userId,
        {
          name: "Minimal Song",
          preset: [presetFile()],
          ir: [],
          nam: [],
          cover: [],
        },
        storage,
      );

      expect(result.artist).toBeNull();
      expect(result).not.toHaveProperty("pedalPresetName");
      expect(result.extraConfig).toEqual({});

      const [songRow] = await db<{
        artist: string | null;
        extra_config: string;
      }[]>`SELECT artist, extra_config FROM songs WHERE id = ${result.id}`;
      expect(songRow.artist).toBeNull();
      expect(JSON.parse(songRow.extra_config)).toEqual({});
    });

    test("multiple ir and nam each get independent sequential sort_order from 0 (R4, R5)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const result = await createSong(
        userId,
        {
          name: "Many Files",
          preset: [presetFile()],
          ir: [file("a.wav", [1]), file("b.wav", [2]), file("c.wav", [3])],
          nam: [file("x.nam", [10]), file("y.nam", [20])],
          cover: [],
        },
        storage,
      );

      const irFiles = result.files.filter((f) => f.kind === "ir");
      const namFiles = result.files.filter((f) => f.kind === "nam");
      expect(irFiles.map((f) => f.sortOrder)).toEqual([0, 1, 2]);
      expect(namFiles.map((f) => f.sortOrder)).toEqual([0, 1]);

      const presetBytes = await storage.get(
        (await db<{ storage_key: string }[]>`
          SELECT storage_key FROM song_files WHERE song_id = ${result.id} AND kind = 'preset'
        `)[0].storage_key,
      );
      const irBytes = await db<{ storage_key: string; original_filename: string }[]>`
        SELECT storage_key, original_filename FROM song_files WHERE song_id = ${result.id} AND kind = 'ir' ORDER BY sort_order
      `;
      const namBytes = await db<{ storage_key: string; original_filename: string }[]>`
        SELECT storage_key, original_filename FROM song_files WHERE song_id = ${result.id} AND kind = 'nam' ORDER BY sort_order
      `;

      expect(presetBytes).toEqual(fixtureBytes[0]);
      expect(irBytes.map((f) => f.original_filename)).toEqual(["a.wav", "b.wav", "c.wav"]);
      expect(namBytes.map((f) => f.original_filename)).toEqual(["x.nam", "y.nam"]);
    });

    test("missing name -> SongError(400) and no rows inserted (R2)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;
      await expect(
        createSong(
          userId,
          {
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [],
          },
          storage,
        ),
      ).rejects.toBeInstanceOf(SongError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("empty string name -> SongError(400) (R2)", async () => {
      const { userId } = await makeUser();
      await expect(
        createSong(
          userId,
          {
            name: "",
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [],
          },
          storage,
        ),
      ).rejects.toThrow(SongError);
    });

    test("zero preset files -> SongError(400) 'at least one preset file is required', no rows, no stored objects (song_crud_api R3; multiple_presets_per_song R16)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      let caught: unknown;
      try {
        await createSong(
          userId,
          {
            name: "No preset",
            preset: [],
            ir: [file("a.wav", [1])],
            nam: [],
            cover: [file("c.jpg", [2])],
          },
          storage,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SongError);
      expect((caught as SongError).status).toBe(400);
      expect((caught as SongError).message).toBe("at least one preset file is required");

      const [{ c }] = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs WHERE user_id = ${userId}`;
      expect(c).toBe(0);
      const [{ f }] = await db<{ f: number }[]>`SELECT COUNT(*)::int AS f FROM song_files sf
        JOIN songs s ON s.id = sf.song_id WHERE s.user_id = ${userId}`;
      expect(f).toBe(0);
      expect(await countStoredObjects(dir)).toBe(0);
    });

    test("two preset files are accepted as presets 0 and 1 (supersedes song_crud_api R3; multiple_presets_per_song R12, R13)", async () => {
      const { userId } = await makeUser();
      const result = await createSong(
        userId,
        {
          name: "Two presets",
          preset: [presetFile(0, "a.prst"), presetFile(1, "b.prst")],
          ir: [],
          nam: [],
          cover: [],
        },
        storage,
      );
      expect(result.presets.map((p) => [p.sortOrder, p.originalFilename, p.name])).toEqual([
        [0, "a.prst", PRESET_FIXTURES[0].name],
        [1, "b.prst", PRESET_FIXTURES[1].name],
      ]);
    });

    test("two cover files -> SongError(400) (R7)", async () => {
      const { userId } = await makeUser();
      await expect(
        createSong(
          userId,
          {
            name: "Two covers",
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [file("a.jpg", [1]), file("b.jpg", [2])],
          },
          storage,
        ),
      ).rejects.toThrow(SongError);
    });

    test("invalid JSON extraConfig -> SongError(400) and no rows inserted (R9)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;

      await expect(
        createSong(
          userId,
          {
            name: "Bad JSON",
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [],
            extraConfig: "{not json",
          },
          storage,
        ),
      ).rejects.toThrow(SongError);

      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("non-object JSON extraConfig (array, string, number, null) -> SongError(400) (R9)", async () => {
      const { userId } = await makeUser();
      for (const nonObject of ["[1,2]", '"text"', "42", "null"]) {
        await expect(
          createSong(
            userId,
            {
              name: "Bad JSON",
              extraConfig: nonObject,
              preset: [presetFile()],
              ir: [],
              nam: [],
              cover: [],
            },
            storage,
          ),
        ).rejects.toThrow(SongError);
      }
    });

    test("exactly one cover file is accepted (R6)", async () => {
      const { userId } = await makeUser();

      const result = await createSong(
        userId,
        {
          name: "One cover",
          preset: [presetFile()],
          ir: [],
          nam: [],
          cover: [file("cover.jpg", [9, 9])],
        },
        storage,
      );

      const covers = result.files.filter((f) => f.kind === "cover");
      expect(covers).toHaveLength(1);
      expect(covers[0].originalFilename).toBe("cover.jpg");
    });

    test("nontrivial extra_config (nested object, array, string, number, boolean, null) round-trips unchanged (R2)", async () => {
      const { userId } = await makeUser();
      const original = {
        nested: { keep: "this", count: 7, on: true, nothing: null },
        list: [1, "two", false, null, { five: 5 }],
        flag: false,
        missing: null,
      };

      const result = await createSong(
        userId,
        {
          name: "Round trip",
          preset: [presetFile()],
          ir: [],
          nam: [],
          cover: [],
          extraConfig: JSON.stringify(original),
        },
        storage,
      );

      expect(result.extraConfig).toEqual(original);

      const fetched = await getSongById(userId, result.id);
      expect(fetched.extraConfig).toEqual(original);
    });

    test("oversized extra_config (UTF-8 byte length > MAX_EXTRA_CONFIG_BYTES) -> SongError(400) and no rows inserted (R4)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;

      const oversized = `{"note":"${"x".repeat(MAX_EXTRA_CONFIG_BYTES)}"}`;
      expect(new TextEncoder().encode(oversized).length).toBeGreaterThan(MAX_EXTRA_CONFIG_BYTES);

      let caught: unknown;
      try {
        await createSong(
          userId,
          {
            name: "Too big",
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [],
            extraConfig: oversized,
          },
          storage,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SongError);
      expect((caught as SongError).status).toBe(400);
      expect((caught as SongError).message).toContain(String(MAX_EXTRA_CONFIG_BYTES));

      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("extra_config at exactly MAX_EXTRA_CONFIG_BYTES bytes (valid JSON object) is accepted (R5)", async () => {
      const { userId } = await makeUser();
      const padding = "x".repeat(MAX_EXTRA_CONFIG_BYTES - '{"note":""}'.length);
      const payload = `{"note":"${padding}"}`;
      expect(new TextEncoder().encode(payload).length).toBe(MAX_EXTRA_CONFIG_BYTES);

      const result = await createSong(
        userId,
        {
          name: "At cap",
          preset: [presetFile()],
          ir: [],
          nam: [],
          cover: [],
          extraConfig: payload,
        },
        storage,
      );

      expect(result.extraConfig).toEqual({ note: padding });
    });

    test("createSong with userId that has no matching users row -> SongError(404) (R7)", async () => {
      const ghostUserId = crypto.randomUUID();

      let caught: unknown;
      try {
        await createSong(
          ghostUserId,
          {
            name: "Ghost user",
            preset: [presetFile()],
            ir: [],
            nam: [],
            cover: [],
          },
          storage,
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SongError);
      expect((caught as SongError).status).toBe(404);
    });
  });

  describe("listSongs", () => {
    test("returns only user's non-deleted songs, excluding soft-deleted and other-user songs (R15)", async () => {
      const { userId: userAId } = await makeUser("list-A");
      const { userId: userBId } = await makeUser("list-B");

      const aSong1 = await seedSong(userAId, { name: "A1" });
      const aSong2 = await seedSong(userAId, { name: "A2" });
      await seedSong(userBId, { name: "B1" });
      await deleteSong(userAId, aSong2.songId);

      const aList = await listSongs(userAId);
      const aIds = aList.map((s) => s.id);
      expect(aIds).toContain(aSong1.songId);
      expect(aIds).not.toContain(aSong2.songId);

      const bList = await listSongs(userBId);
      expect(bList.map((s) => s.name)).toEqual(["B1"]);
    });
  });

  describe("getSongById", () => {
    test("returns song + ordered non-preset files for owning user; preset rows are in presets (song_crud_api R16; multiple_presets_per_song R23, R24)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId, {
        name: "Owned",
        ir: [file("a.wav", [1])],
        nam: [file("x.nam", [10]), file("y.nam", [20])],
        cover: [file("cover.jpg", [99])],
      });

      const result = await getSongById(userId, songId);
      expect(result.id).toBe(songId);
      expect(result.name).toBe("Owned");
      expect(result.files.map((f) => f.kind)).toEqual(["cover", "ir", "nam", "nam"]);
      expect(result.presets.map((p) => p.name)).toEqual([PRESET_FIXTURES[0].name]);
    });

    test("nonexistent UUID -> SongError(404) (R17)", async () => {
      const { userId } = await makeUser();
      await expect(getSongById(userId, crypto.randomUUID())).rejects.toThrow(SongError);
    });

    test("soft-deleted song -> SongError(404) (R17)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      await deleteSong(userId, songId);
      await expect(getSongById(userId, songId)).rejects.toThrow(SongError);
    });

    test("foreign user -> SongError(404) (R17)", async () => {
      const { userId: owner } = await makeUser("fgn-owner");
      const { userId: other } = await makeUser("fgn-other");
      const { songId } = await seedSong(owner);
      await expect(getSongById(other, songId)).rejects.toThrow(SongError);
    });

    test("invalid UUID -> SongError(404) (R18)", async () => {
      const { userId } = await makeUser();
      await expect(getSongById(userId, "not-a-uuid")).rejects.toThrow(SongError);
    });
  });

  describe("getSongFile", () => {
    test("preset, no sort_order -> bytes + mimeType + originalFilename round-tripped (R1, R3, R4)", async () => {
      const { userId } = await makeUser();
      const preset = presetFile();
      const { songId, storage: s2 } = await seedSong(userId, {
        name: "Round trip preset",
        preset: [preset],
      });

      const result = await getSongFile(userId, songId, "preset", undefined, s2);
      expect(result.bytes).toEqual(preset.bytes);
      expect(result.mimeType).toBe("application/octet-stream");
      expect(result.originalFilename).toBe("preset.prst");
    });

    test("multiple ir files: sort_order=0 and sort_order=1 each return the correct file's bytes (R2)", async () => {
      const { userId } = await makeUser();
      const irA = file("a.wav", [10, 11, 12]);
      const irB = file("b.wav", [20, 21]);
      const irC = file("c.wav", [30, 31, 32, 33]);
      const { songId, storage: s2 } = await seedSong(userId, {
        name: "Many ir files",
        ir: [irA, irB, irC],
      });

      const zero = await getSongFile(userId, songId, "ir", "0", s2);
      expect(zero.bytes).toEqual(irA.bytes);
      expect(zero.originalFilename).toBe("a.wav");

      const one = await getSongFile(userId, songId, "ir", "1", s2);
      expect(one.bytes).toEqual(irB.bytes);
      expect(one.originalFilename).toBe("b.wav");

      const two = await getSongFile(userId, songId, "ir", "2", s2);
      expect(two.bytes).toEqual(irC.bytes);
    });

    test("invalid UUID songId -> SongError(404) (R5)", async () => {
      const { userId } = await makeUser();
      await expect(getSongFile(userId, "not-a-uuid", "preset", undefined, storage)).rejects.toThrow(SongError);
    });

    test("nonexistent song UUID -> SongError(404) (R6)", async () => {
      const { userId } = await makeUser();
      await expect(getSongFile(userId, crypto.randomUUID(), "preset", undefined, storage)).rejects.toThrow(SongError);
    });

    test("soft-deleted song -> SongError(404) (R6)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      await deleteSong(userId, songId);
      await expect(getSongFile(userId, songId, "preset", undefined, storage)).rejects.toThrow(SongError);
    });

    test("foreign-owned song -> SongError(404) (R6)", async () => {
      const { userId: owner } = await makeUser("getfile-owner");
      const { userId: other } = await makeUser("getfile-other");
      const { songId } = await seedSong(owner);
      await expect(getSongFile(other, songId, "preset", undefined, storage)).rejects.toThrow(SongError);
    });

    test("unknown :kind -> SongError(404) (R7)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      await expect(getSongFile(userId, songId, "midi", undefined, storage)).rejects.toThrow(SongError);
    });

    test("valid :kind with no matching song_files row -> SongError(404) (R8)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId, {
        name: "Preset only",
        ir: [],
        nam: [],
        cover: [],
      });
      await expect(getSongFile(userId, songId, "cover", undefined, storage)).rejects.toThrow(SongError);
    });

    test("valid kind but sort_order beyond what exists -> SongError(404) (R8)", async () => {
      const { userId } = await makeUser();
      const { songId, storage: s2 } = await seedSong(userId, {
        name: "Two ir",
        ir: [file("a.wav", [1]), file("b.wav", [2])],
      });
      await expect(getSongFile(userId, songId, "ir", "5", s2)).rejects.toThrow(SongError);
    });

    test("malformed sort_order ('abc', '-1') -> SongError(404), default 0 not used (R9)", async () => {
      const { userId } = await makeUser();
      const { songId, storage: s2 } = await seedSong(userId);
      await expect(getSongFile(userId, songId, "preset", "abc", s2)).rejects.toThrow(SongError);
      await expect(getSongFile(userId, songId, "preset", "-1", s2)).rejects.toThrow(SongError);
    });

    test("song_files row whose bytes were removed from storage -> non-SongError propagates (R11)", async () => {
      const { userId } = await makeUser();
      const preset = presetFile();
      const { songId, storage: s2 } = await seedSong(userId, {
        name: "Bytes vanish",
        preset: [preset],
      });

      const db = getDb();
      const [fileRow] = await db<{ storage_key: string }[]>`
        SELECT storage_key FROM song_files WHERE song_id = ${songId} AND kind = 'preset'
      `;
      await s2.delete(fileRow.storage_key);

      await expect(getSongFile(userId, songId, "preset", undefined, s2)).rejects.toThrow(Error);
      await expect(getSongFile(userId, songId, "preset", undefined, s2)).rejects.not.toBeInstanceOf(SongError);
    });
  });

  describe("isUuid", () => {
    test("isUuid returns true for valid UUID and false for garbage (R18)", () => {
      expect(isUuid(crypto.randomUUID())).toBe(true);
      expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
      expect(isUuid("not-a-uuid")).toBe(false);
      expect(isUuid("")).toBe(false);
      expect(isUuid("00000000-0000-0000-0000-00000000000")).toBe(false);
      expect(isUuid("00000000-0000-0000-0000-00000000000Z")).toBe(false);
    });
  });

  describe("deleteSong", () => {
    test("soft-deletes song + files; storage bytes are untouched (R19)", async () => {
      const { userId } = await makeUser();
      const { songId, storage: s2, dir: d2 } = await seedSong(userId, {
        name: "Soft delete",
        ir: [file("a.wav", [1, 2])],
        cover: [file("c.jpg", [3])],
      });

      const db = getDb();
      const fileRowsBefore = await db<{ storage_key: string }[]>`
        SELECT storage_key FROM song_files WHERE song_id = ${songId}
      `;
      const bytesBefore = await Promise.all(
        fileRowsBefore.map((r) => s2.get(r.storage_key)),
      );
      expect(bytesBefore.every((b) => b !== null)).toBe(true);

      await deleteSong(userId, songId);

      const [songRow] = await db<{ deleted_at: string | null }[]>`
        SELECT deleted_at FROM songs WHERE id = ${songId}
      `;
      expect(songRow.deleted_at).not.toBeNull();

      const fileRowsAfter = await db<{ deleted_at: string | null; storage_key: string }[]>`
        SELECT deleted_at, storage_key FROM song_files WHERE song_id = ${songId}
      `;
      expect(fileRowsAfter.every((r) => r.deleted_at !== null)).toBe(true);

      const bytesAfter = await Promise.all(
        fileRowsAfter.map((r) => s2.get(r.storage_key)),
      );
      for (let i = 0; i < bytesAfter.length; i++) {
        expect(bytesAfter[i]).toEqual(bytesBefore[i]);
      }

      await rm(d2, { recursive: true, force: true });
    });

    test("nonexistent UUID -> SongError(404) (R20)", async () => {
      const { userId } = await makeUser();
      await expect(deleteSong(userId, crypto.randomUUID())).rejects.toThrow(SongError);
    });

    test("already soft-deleted -> SongError(404) (R20)", async () => {
      const { userId } = await makeUser();
      const { songId } = await seedSong(userId);
      await deleteSong(userId, songId);
      await expect(deleteSong(userId, songId)).rejects.toThrow(SongError);
    });

    test("foreign-owned -> SongError(404), target row unmodified (R20)", async () => {
      const { userId: owner } = await makeUser("del-owner");
      const { userId: other } = await makeUser("del-other");
      const { songId } = await seedSong(owner);
      const db = getDb();

      await expect(deleteSong(other, songId)).rejects.toThrow(SongError);

      const [songRow] = await db<{ deleted_at: string | null }[]>`
        SELECT deleted_at FROM songs WHERE id = ${songId}
      `;
      expect(songRow.deleted_at).toBeNull();
    });

    test("invalid UUID -> SongError(404) (R18)", async () => {
      const { userId } = await makeUser();
      await expect(deleteSong(userId, "not-a-uuid")).rejects.toThrow(SongError);
    });
  });
});

describe("song routes (R14)", () => {
  test("POST /songs without bearer -> 401", async () => {
    const fd = new FormData();
    fd.append("name", "x");
    fd.append("preset", new File([new Uint8Array([1])], "p.syx"));
    const res = await app.request("/songs", { method: "POST", body: fd });
    expect(res.status).toBe(401);
  });

  test("GET /songs without bearer -> 401", async () => {
    const res = await app.request("/songs");
    expect(res.status).toBe(401);
  });

  test("GET /songs/:id without bearer -> 401", async () => {
    const res = await app.request(`/songs/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
  });

  test("DELETE /songs/:id without bearer -> 401", async () => {
    const res = await app.request(`/songs/${crypto.randomUUID()}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("POST /songs end-to-end via app.request (R1)", () => {
  test("multipart FormData with preset returns 201 with song+files shape", async () => {
    const db = getDb();
    const email = `e2e-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const fd = new FormData();
    fd.append("name", "End to End");
    fd.append("artist", "E2E Artist");
    fd.append("extra_config", '{"foo":"bar"}');
    fd.append(
      "preset",
      new File([new Uint8Array(fixtureBytes[0]!)], "p.prst", { type: "application/octet-stream" }),
    );

    const res = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      name: string;
      artist: string;
      extraConfig: Record<string, unknown>;
      files: Array<{ kind: string }>;
      presets: Array<{ name: string; originalFilename: string; byteSize: number }>;
    };
    expect(body.name).toBe("End to End");
    expect(body.artist).toBe("E2E Artist");
    expect(body.extraConfig).toEqual({ foo: "bar" });
    expect(body.files).toHaveLength(0);
    expect(body.presets).toHaveLength(1);
    expect(body.presets[0]!.name).toBe(PRESET_FIXTURES[0].name);
    expect(body.presets[0]!.originalFilename).toBe("p.prst");
    expect(body.presets[0]!.byteSize).toBe(507);
    expect(body).not.toHaveProperty("pedalPresetName");
  });
});

describe("multiple presets per song (multiple_presets_per_song)", () => {
  let dir: string;
  let storage: LocalFsStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "song-multi-"));
    storage = new LocalFsStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function threePresetInput(name = "Three presets"): CreateSongInput {
    return {
      name,
      preset: PRESET_FIXTURES.map((f, i) => presetFile(i, f.file)),
      ir: [],
      nam: [],
      cover: [],
    };
  }

  test("3 presets create 3 rows with sort_order 0,1,2 in send order, each named from its bytes (R12, R13, R15)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const sendOrder = [2, 0, 1];
    const result = await createSong(
      userId,
      {
        name: "Three",
        preset: sendOrder.map((i) => presetFile(i, PRESET_FIXTURES[i]!.file)),
        ir: [],
        nam: [],
        cover: [],
      },
      storage,
    );

    const rows = await db<
      { sort_order: number; pedal_preset_name: string; original_filename: string; storage_key: string }[]
    >`
      SELECT sort_order, pedal_preset_name, original_filename, storage_key FROM song_files
      WHERE song_id = ${result.id} AND kind = 'preset' AND deleted_at IS NULL
      ORDER BY sort_order ASC
    `;
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => [r.sort_order, r.pedal_preset_name, r.original_filename])).toEqual(
      sendOrder.map((i, pos) => [pos, PRESET_FIXTURES[i]!.name, PRESET_FIXTURES[i]!.file]),
    );
    for (const [pos, row] of rows.entries()) {
      expect(await storage.get(row.storage_key)).toEqual(fixtureBytes[sendOrder[pos]!]);
    }
  });

  test("two presets with identical bytes get distinct storage keys and both read back (R14)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const result = await createSong(
      userId,
      {
        name: "Twins",
        preset: [presetFile(0, "a.prst"), presetFile(0, "b.prst")],
        ir: [],
        nam: [],
        cover: [],
      },
      storage,
    );

    const rows = await db<{ storage_key: string }[]>`
      SELECT storage_key FROM song_files
      WHERE song_id = ${result.id} AND kind = 'preset' ORDER BY sort_order
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0]!.storage_key).not.toBe(rows[1]!.storage_key);
    expect(await storage.get(rows[0]!.storage_key)).toEqual(fixtureBytes[0]);
    expect(await storage.get(rows[1]!.storage_key)).toEqual(fixtureBytes[0]);
    expect(await countStoredObjects(dir)).toBe(2);
  });

  test("a non-GP-5 second preset -> SongError(400) naming position 1, no rows, no storage put (R17)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    let caught: unknown;
    try {
      await createSong(
        userId,
        {
          name: "Bad second",
          preset: [presetFile(0), file("junk.prst", [1, 2, 3, 4, 5])],
          ir: [file("a.wav", [1])],
          nam: [],
          cover: [],
        },
        storage,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SongError);
    expect((caught as SongError).status).toBe(400);
    expect((caught as SongError).message).toBe(
      "preset file at position 1 has no readable GP-5 preset name",
    );

    const [{ c }] = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM songs WHERE user_id = ${userId}`;
    expect(c).toBe(0);
    const [{ f }] = await db<{ f: number }[]>`SELECT COUNT(*)::int AS f FROM song_files sf
      JOIN songs s ON s.id = sf.song_id WHERE s.user_id = ${userId}`;
    expect(f).toBe(0);
    expect(await countStoredObjects(dir)).toBe(0);
  });

  test("createSong, getSongById and listSongs return presets ordered by sortOrder with exactly the R21 fields and no pedalPresetName (R19, R20, R21, R25)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const created = await createSong(userId, threePresetInput(), storage);
    const fetched = await getSongById(userId, created.id);
    const listed = (await listSongs(userId)).find((s) => s.id === created.id)!;

    const rows = await db<
      {
        id: string;
        sort_order: number;
        pedal_preset_name: string;
        original_filename: string;
        mime_type: string;
        byte_size: number;
      }[]
    >`
      SELECT id, sort_order, pedal_preset_name, original_filename, mime_type, byte_size
      FROM song_files WHERE song_id = ${created.id} AND kind = 'preset' ORDER BY sort_order
    `;

    for (const song of [created, fetched, listed]) {
      expect(song).not.toHaveProperty("pedalPresetName");
      expect(song.presets).toHaveLength(3);
      expect(song.presets.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
      for (const [i, preset] of song.presets.entries()) {
        expect(Object.keys(preset).sort()).toEqual(presetDtoKeys);
        const row = rows[i]!;
        expect(preset.id).toBe(row.id);
        expect(preset.name).toBe(row.pedal_preset_name);
        expect(preset.name).toBe(PRESET_FIXTURES[i]!.name);
        expect(preset.originalFilename).toBe(row.original_filename);
        expect(preset.mimeType).toBe(row.mime_type);
        expect(preset.byteSize).toBe(row.byte_size);
        expect(typeof preset.createdAt).toBe("string");
      }
    }
  });

  test("presets are ordered by sort_order even when rows were inserted out of order (R20)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${userId}, 'Out of order') RETURNING id
    `;
    for (const sortOrder of [2, 0, 1]) {
      await db`
        INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order, pedal_preset_name)
        VALUES (${song!.id}, 'preset', ${`k-${crypto.randomUUID()}`}, ${`p${sortOrder}.prst`},
          'application/octet-stream', 507, ${sortOrder}, ${`P${sortOrder}`})
      `;
    }

    const fetched = await getSongById(userId, song!.id);
    expect(fetched.presets.map((p) => p.name)).toEqual(["P0", "P1", "P2"]);
    const listed = (await listSongs(userId)).find((s) => s.id === song!.id)!;
    expect(listed.presets.map((p) => p.name)).toEqual(["P0", "P1", "P2"]);
  });

  test("a soft-deleted preset row is omitted from presets in getSongById and listSongs (R22)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const created = await createSong(userId, threePresetInput(), storage);
    await db`
      UPDATE song_files SET deleted_at = NOW()
      WHERE song_id = ${created.id} AND kind = 'preset' AND sort_order = 1
    `;

    const fetched = await getSongById(userId, created.id);
    expect(fetched.presets.map((p) => p.sortOrder)).toEqual([0, 2]);
    const listed = (await listSongs(userId)).find((s) => s.id === created.id)!;
    expect(listed.presets.map((p) => p.sortOrder)).toEqual([0, 2]);
  });

  test("files excludes every preset row and includes every live ir/nam/cover row, on create and get (R23, R24)", async () => {
    const { userId } = await makeUser("multi");
    const db = getDb();
    const created = await createSong(
      userId,
      {
        ...threePresetInput(),
        ir: [file("a.wav", [1]), file("b.wav", [2])],
        nam: [file("x.nam", [3])],
        cover: [file("c.jpg", [4])],
      },
      storage,
    );
    expect(created.files.map((f) => f.kind).sort()).toEqual(["cover", "ir", "ir", "nam"]);

    const [irOne] = await db<{ id: string }[]>`
      SELECT id FROM song_files WHERE song_id = ${created.id} AND kind = 'ir' AND sort_order = 1
    `;
    await db`UPDATE song_files SET deleted_at = NOW() WHERE id = ${irOne!.id}`;

    const fetched = await getSongById(userId, created.id);
    expect(fetched.files.some((f) => f.kind === "preset")).toBe(false);
    expect(fetched.files.map((f) => [f.kind, f.sortOrder])).toEqual([
      ["cover", 0],
      ["ir", 0],
      ["nam", 0],
    ]);
    expect(fetched.presets).toHaveLength(3);
  });

  test("listSongs does not include another user's presets, and a song with no presets gets [] (R19)", async () => {
    const { userId: a } = await makeUser("multi-a");
    const { userId: b } = await makeUser("multi-b");
    const aSong = await createSong(a, threePresetInput("A"), storage);
    const bSong = await createSong(
      b,
      { name: "B", preset: [presetFile(2)], ir: [], nam: [], cover: [] },
      storage,
    );

    const aList = await listSongs(a);
    expect(aList.map((s) => s.id)).toEqual([aSong.id]);
    expect(aList[0]!.presets.map((p) => p.id)).toEqual(aSong.presets.map((p) => p.id));
    const allAPresetIds = aList.flatMap((s) => s.presets.map((p) => p.id));
    for (const p of bSong.presets) expect(allAPresetIds).not.toContain(p.id);

    const db = getDb();
    const [bare] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${b}, 'No presets') RETURNING id
    `;
    const bList = await listSongs(b);
    expect(bList.find((s) => s.id === bare!.id)!.presets).toEqual([]);
    expect(bList.find((s) => s.id === bSong.id)!.presets.map((p) => p.name)).toEqual([
      PRESET_FIXTURES[2].name,
    ]);
  });

  test("getSongFile preset sort_order 0|1|2 returns each fixture's bytes, omitted -> 0, 3 -> 404 (R26, R27, R28)", async () => {
    const { userId } = await makeUser("multi");
    const created = await createSong(userId, threePresetInput(), storage);

    for (const [i, f] of PRESET_FIXTURES.entries()) {
      const out = await getSongFile(userId, created.id, "preset", String(i), storage);
      expect(out.bytes).toEqual(fixtureBytes[i]);
      expect(out.originalFilename).toBe(f.file);
    }
    const dflt = await getSongFile(userId, created.id, "preset", undefined, storage);
    expect(dflt.bytes).toEqual(fixtureBytes[0]);

    let caught: unknown;
    try {
      await getSongFile(userId, created.id, "preset", "3", storage);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SongError);
    expect((caught as SongError).status).toBe(404);
  });
});

describe("createSong plan tiers (plan_tiers_songs_and_presets_per_song_limits)", () => {
  let dir: string;
  let storage: LocalFsStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "plan-tier-"));
    storage = new LocalFsStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function insertLiveSongs(userId: string, count: number): Promise<string[]> {
    const db = getDb();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const [row] = await db<{ id: string }[]>`
        INSERT INTO songs (user_id, name) VALUES (${userId}, ${`Existing ${i}`}) RETURNING id
      `;
      ids.push(row!.id);
    }
    return ids;
  }

  function inputWithPresets(name: string, presetCount: number): CreateSongInput {
    return {
      name,
      preset: Array.from({ length: presetCount }, (_, i) =>
        presetFile(i % fixtureBytes.length, `p${i}.prst`),
      ),
      ir: [],
      nam: [],
      cover: [],
    };
  }

  async function countUserRows(userId: string): Promise<{ songs: number; files: number }> {
    const db = getDb();
    const [r] = await db<{ songs: number; files: number }[]>`
      SELECT (SELECT COUNT(*)::int FROM songs WHERE user_id = ${userId}) AS songs,
             (SELECT COUNT(*)::int FROM song_files sf JOIN songs s ON s.id = sf.song_id
              WHERE s.user_id = ${userId}) AS files
    `;
    return r!;
  }

  async function expectRejected(
    userId: string,
    input: CreateSongInput,
    code: PlanLimitCode,
    plan: Plan,
    limit: number,
  ): Promise<void> {
    const before = await countUserRows(userId);
    let caught: unknown;
    try {
      await createSong(userId, input, storage);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlanLimitError);
    const err = caught as PlanLimitError;
    expect(err.code).toBe(code);
    expect(err.plan).toBe(plan);
    expect(err.limit).toBe(limit);
    expect(err.status).toBe(402);
    // R16: nothing persisted
    expect(await countUserRows(userId)).toEqual(before);
    expect(await countStoredObjects(dir)).toBe(0);
  }

  test("free: 0 live songs + 1 preset -> created (R6)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    const result = await createSong(userId, inputWithPresets("First", 1), storage);
    expect(result.presets).toHaveLength(1);
  });

  test("free: 1 live song -> plan_song_limit, limit 1, nothing persisted (R7, R16)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    await insertLiveSongs(userId, 1);
    await expectRejected(userId, inputWithPresets("Second", 1), "plan_song_limit", "free", 1);
  });

  test("free: 0 live songs + 2 presets -> plan_preset_limit, limit 1, nothing persisted (R11, R16)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    await expectRejected(userId, inputWithPresets("Two presets", 2), "plan_preset_limit", "free", 1);
  });

  test("free: 1 live song + 2 presets -> plan_song_limit wins (R13)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    await insertLiveSongs(userId, 1);
    await expectRejected(userId, inputWithPresets("Both", 2), "plan_song_limit", "free", 1);
  });

  test("basic: 1 live song + 2 presets -> created (R8)", async () => {
    const { userId } = await makeUser("tier-basic", "basic");
    await insertLiveSongs(userId, 1);
    const result = await createSong(userId, inputWithPresets("Second", 2), storage);
    expect(result.presets).toHaveLength(2);
  });

  test("basic: 2 live songs -> plan_song_limit, limit 2, nothing persisted (R9, R16)", async () => {
    const { userId } = await makeUser("tier-basic", "basic");
    await insertLiveSongs(userId, 2);
    await expectRejected(userId, inputWithPresets("Third", 1), "plan_song_limit", "basic", 2);
  });

  test("basic: 1 live song + 3 presets -> plan_preset_limit, limit 2, nothing persisted (R12, R16)", async () => {
    const { userId } = await makeUser("tier-basic", "basic");
    await insertLiveSongs(userId, 1);
    await expectRejected(userId, inputWithPresets("Three", 3), "plan_preset_limit", "basic", 2);
  });

  test("premium: 3 live songs + 3 presets -> created (R10)", async () => {
    const { userId } = await makeUser("tier-premium", "premium");
    await insertLiveSongs(userId, 3);
    const result = await createSong(userId, inputWithPresets("Fourth", 3), storage);
    expect(result.presets).toHaveLength(3);
  });

  test("free: 1 soft-deleted song and 0 live songs -> created (R18)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    const [songId] = await insertLiveSongs(userId, 1);
    await getDb()`UPDATE songs SET deleted_at = NOW() WHERE id = ${songId!}`;
    const result = await createSong(userId, inputWithPresets("After delete", 1), storage);
    expect(result.name).toBe("After delete");
  });

  test("free: 1 live song + empty name -> SongError 400, not 402 (R17)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    await insertLiveSongs(userId, 1);
    let caught: unknown;
    try {
      await createSong(userId, inputWithPresets("", 2), storage);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SongError);
    expect((caught as SongError).status).toBe(400);
  });

  test("free: 1 live song + unreadable preset -> SongError 400, not 402 (R17)", async () => {
    const { userId } = await makeUser("tier-free", "free");
    await insertLiveSongs(userId, 1);
    let caught: unknown;
    try {
      await createSong(
        userId,
        { name: "Bad", preset: [file("bad.prst", [1, 2, 3])], ir: [], nam: [], cover: [] },
        storage,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SongError);
    expect((caught as SongError).status).toBe(400);
  });
});
