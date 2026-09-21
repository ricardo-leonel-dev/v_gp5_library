import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db/client";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import {
  createPedal,
  listPedals,
  PedalError,
  type CreatePedalInput,
  type UploadedFile,
} from "./pedal-service";

function file(name: string, bytes: number[]): UploadedFile {
  return { filename: name, mimeType: "image/png", bytes: new Uint8Array(bytes) };
}

function imageFile(): UploadedFile {
  return file("ref.png", [1, 2, 3, 4, 5]);
}

async function makeUser(emailPrefix = "pedal-cru"): Promise<{ userId: string }> {
  const db = getDb();
  const email = `${emailPrefix}-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
  `;
  return { userId: user.id };
}

async function seedPedal(
  userId: string,
  override: Partial<CreatePedalInput> = {},
): Promise<{ pedalId: string; storage: LocalFsStorageAdapter; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pedal-cru-"));
  const storage = new LocalFsStorageAdapter(dir);
  const input: CreatePedalInput = {
    name: "Test Pedal",
    image: [imageFile()],
    ...override,
  };
  const result = await createPedal(userId, input, storage);
  return { pedalId: result.id, storage, dir };
}

describe("pedal-service", () => {
  let dir: string;
  let storage: LocalFsStorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "pedal-cru-"));
    storage = new LocalFsStorageAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("createPedal", () => {
    test("missing name -> PedalError(400) and no row inserted (R2)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      await expect(
        createPedal(
          userId,
          {
            image: [imageFile()],
          },
          storage,
        ),
      ).rejects.toBeInstanceOf(PedalError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("empty string name -> PedalError(400) and no row inserted (R2)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      await expect(
        createPedal(
          userId,
          {
            name: "",
            image: [imageFile()],
          },
          storage,
        ),
      ).rejects.toThrow(PedalError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("whitespace-only name -> PedalError(400) and no row inserted (R2)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      await expect(
        createPedal(
          userId,
          {
            name: "   ",
            image: [imageFile()],
          },
          storage,
        ),
      ).rejects.toThrow(PedalError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("zero image files -> PedalError(400) and no row inserted (R3)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      await expect(
        createPedal(
          userId,
          {
            name: "No image",
            image: [],
          },
          storage,
        ),
      ).rejects.toThrow(PedalError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("two image files -> PedalError(400) and no row inserted (R3)", async () => {
      const { userId } = await makeUser();
      const db = getDb();

      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      await expect(
        createPedal(
          userId,
          {
            name: "Two images",
            image: [imageFile(), imageFile()],
          },
          storage,
        ),
      ).rejects.toThrow(PedalError);
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
    });

    test("valid input returns PedalDto with name + createdBy and bytes round-trip via storage (R1, R4)", async () => {
      const { userId } = await makeUser();
      const db = getDb();
      const image = imageFile();

      const result = await createPedal(
        userId,
        {
          name: "Big Muff",
          image: [image],
        },
        storage,
      );

      expect(result.name).toBe("Big Muff");
      expect(result.createdBy).toBe(userId);
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(typeof result.createdAt).toBe("string");
      expect(typeof result.updatedAt).toBe("string");

      const [row] = await db<{ reference_image_key: string; name: string; created_by: string }[]>`
        SELECT reference_image_key, name, created_by FROM pedal_catalog WHERE id = ${result.id}
      `;
      expect(row.name).toBe("Big Muff");
      expect(row.created_by).toBe(userId);

      const bytes = await storage.get(row.reference_image_key);
      expect(bytes).toEqual(image.bytes);
    });
  });

  describe("listPedals", () => {
    test("returns pedals created by multiple distinct users and excludes soft-deleted rows (R6)", async () => {
      const { userId: userAId } = await makeUser("list-A");
      const { userId: userBId } = await makeUser("list-B");

      const aPedal = await seedPedal(userAId, { name: "A Pedal" });
      const bPedal = await seedPedal(userBId, { name: "B Pedal" });
      const bPedal2 = await seedPedal(userBId, { name: "B Pedal 2" });

      const db = getDb();
      await db`UPDATE pedal_catalog SET deleted_at = NOW() WHERE id = ${bPedal2.pedalId}`;

      const listed = await listPedals();
      const listedIds = listed.map((p) => p.id);
      expect(listedIds).toContain(aPedal.pedalId);
      expect(listedIds).toContain(bPedal.pedalId);
      expect(listedIds).not.toContain(bPedal2.pedalId);

      const listedA = listed.find((p) => p.id === aPedal.pedalId);
      expect(listedA).toBeDefined();
      expect(listedA!.createdBy).toBe(userAId);
      expect(listedA!.name).toBe("A Pedal");

      const listedB = listed.find((p) => p.id === bPedal.pedalId);
      expect(listedB).toBeDefined();
      expect(listedB!.createdBy).toBe(userBId);
      expect(listedB!.name).toBe("B Pedal");

      await rm(aPedal.dir, { recursive: true, force: true });
      await rm(bPedal.dir, { recursive: true, force: true });
    });
  });
});
