import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db/client";
import { issueToken } from "../auth/jwt";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import {
  createSong,
  deleteSong,
  getSongById,
  isUuid,
  listSongs,
  SongError,
  type CreateSongInput,
  type UploadedFile,
} from "./song-service";
import app from "../index";

function file(name: string, bytes: number[]): UploadedFile {
  return { filename: name, mimeType: "application/octet-stream", bytes: new Uint8Array(bytes) };
}

function presetFile(): UploadedFile {
  return file("preset.syx", [1, 2, 3, 4, 5]);
}

async function makeUser(emailPrefix = "song-cru"):
  Promise<{ userId: string; token: string }> {
  const db = getDb();
  const email = `${emailPrefix}-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
  `;
  const token = await issueToken(user.id, "free");
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
    test("valid preset + artist + pedalPresetName + extraConfig returns SongWithFilesDto with bytes round-tripped (R1, R6, R8, R11, R13)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      const preset = presetFile();

      const result = await createSong(
        userId,
        {
          name: "My Song",
          artist: "An Artist",
          pedalPresetName: "My Pedal Preset",
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
      expect(result.pedalPresetName).toBe("My Pedal Preset");
      expect(result.extraConfig).toEqual({ gain: 1, tone: "bright" });
      expect(result.files).toHaveLength(1);
      expect(result.files[0].kind).toBe("preset");
      expect(result.files[0].originalFilename).toBe("preset.syx");
      expect(result.files[0].mimeType).toBe("application/octet-stream");
      expect(result.files[0].byteSize).toBe(5);
      expect(result.files[0].sortOrder).toBe(0);

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

    test("omitting artist / pedalPresetName / extraConfig stores null / null / {} (R10, R12)", async () => {
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
      expect(result.pedalPresetName).toBeNull();
      expect(result.extraConfig).toEqual({});

      const [songRow] = await db<{
        artist: string | null;
        pedal_preset_name: string | null;
        extra_config: string;
      }[]>`SELECT artist, pedal_preset_name, extra_config FROM songs WHERE id = ${result.id}`;
      expect(songRow.artist).toBeNull();
      expect(songRow.pedal_preset_name).toBeNull();
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

      expect(presetBytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
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

    test("zero preset files -> SongError(400) (R3)", async () => {
      const { userId } = await makeUser();
      await expect(
        createSong(
          userId,
          {
            name: "No preset",
            preset: [],
            ir: [],
            nam: [],
            cover: [],
          },
          storage,
        ),
      ).rejects.toThrow(SongError);
    });

    test("two preset files -> SongError(400) (R3)", async () => {
      const { userId } = await makeUser();
      await expect(
        createSong(
          userId,
          {
            name: "Two presets",
            preset: [presetFile(), presetFile()],
            ir: [],
            nam: [],
            cover: [],
          },
          storage,
        ),
      ).rejects.toThrow(SongError);
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
    test("returns song + ordered files for owning user (R16)", async () => {
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
      expect(result.files.map((f) => f.kind)).toEqual(["cover", "ir", "nam", "nam", "preset"]);
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
      new File([new Uint8Array([7, 8, 9])], "p.syx", { type: "application/octet-stream" }),
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
      files: Array<{ kind: string; originalFilename: string; byteSize: number }>;
    };
    expect(body.name).toBe("End to End");
    expect(body.artist).toBe("E2E Artist");
    expect(body.extraConfig).toEqual({ foo: "bar" });
    expect(body.files).toHaveLength(1);
    expect(body.files[0].kind).toBe("preset");
    expect(body.files[0].originalFilename).toBe("p.syx");
    expect(body.files[0].byteSize).toBe(3);
  });
});
