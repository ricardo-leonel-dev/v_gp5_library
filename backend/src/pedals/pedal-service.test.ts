import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db/client";
import { LocalFsStorageAdapter } from "../storage/local-fs-adapter";
import {
  createPedal,
  getPedalImage,
  listPedals,
  PedalError,
  type CreatePedalInput,
  type UploadedFile,
} from "./pedal-service";
import type { ParameterDefinition } from "./pedal-parameters";

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
      expect(result.parameters).toEqual([]);

      const [row] = await db<{ reference_image_key: string; name: string; created_by: string }[]>`
        SELECT reference_image_key, name, created_by FROM pedal_catalog WHERE id = ${result.id}
      `;
      expect(row.name).toBe("Big Muff");
      expect(row.created_by).toBe(userId);

      const bytes = await storage.get(row.reference_image_key);
      expect(bytes).toEqual(image.bytes);
    });
  });

  describe("createPedal — typed parameters (R1, R2, R3-c, P1)", () => {
    const store = async (
      result: Awaited<ReturnType<typeof createPedal>>,
    ): Promise<unknown> => {
      const [row] = await getDb()<{ parameters: unknown }[]>`
        SELECT parameters FROM pedal_catalog WHERE id = ${result.id}
      `;
      if (typeof row.parameters === "string") return JSON.parse(row.parameters);
      return row.parameters;
    };

    test("R1-a: parameters stored in the order given (knob + switch + selector)", async () => {
      const { userId } = await makeUser("r1a");
      const defs: ParameterDefinition[] = [
        { key: "level", label: "Level", type: "knob", min: 0, max: 10 },
        { key: "boost", label: "Boost", type: "switch" },
        { key: "mode", label: "Mode", type: "selector", options: ["Normal", "Brown"] },
      ];
      const result = await createPedal(
        userId,
        {
          name: "R1a Pedal",
          image: [imageFile()],
          parameters: JSON.stringify(defs),
        },
        storage,
      );
      expect(result.parameters).toEqual(defs);
      const stored = await store(result);
      expect(stored).toEqual(defs);
    });

    test("R1-c: omitted parameters field stores '[]'", async () => {
      const { userId } = await makeUser("r1c");
      const result = await createPedal(
        userId,
        { name: "R1c Pedal", image: [imageFile()] },
        storage,
      );
      expect(result.parameters).toEqual([]);
      const stored = await store(result);
      expect(stored).toEqual([]);
    });

    test("R1-d: '[]' string stores '[]'", async () => {
      const { userId } = await makeUser("r1d");
      const result = await createPedal(
        userId,
        { name: "R1d Pedal", image: [imageFile()], parameters: "[]" },
        storage,
      );
      expect(result.parameters).toEqual([]);
    });

    test("R1-e: knob without min/max defaults to 0..10 in the returned + stored definition", async () => {
      const { userId } = await makeUser("r1e");
      const result = await createPedal(
        userId,
        {
          name: "R1e Pedal",
          image: [imageFile()],
          parameters: JSON.stringify([{ key: "level", label: "Level", type: "knob" }]),
        },
        storage,
      );
      expect(result.parameters).toEqual([
        { key: "level", label: "Level", type: "knob", min: 0, max: 10 },
      ]);
      const stored = await store(result);
      expect(stored).toEqual([
        { key: "level", label: "Level", type: "knob", min: 0, max: 10 },
      ]);
    });

    test("R2 (parameters=null, malformed JSON, value rule failures): PedalError(400), no row, no stored bytes", async () => {
      const db = getDb();
      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      const beforeFiles = await readdir(dir);

      const cases: Array<{ input: CreatePedalInput; label: string }> = [
        { input: { name: "Bad", image: [imageFile()], parameters: null }, label: "parameters=null" },
        {
          input: { name: "Bad", image: [imageFile()], parameters: "{" },
          label: "invalid JSON",
        },
        {
          input: { name: "Bad", image: [imageFile()], parameters: JSON.stringify({ a: 1 }) },
          label: "value is not an array",
        },
        {
          input: {
            name: "Bad",
            image: [imageFile()],
            parameters: JSON.stringify([{ key: "k", label: "K", type: "knob", min: 10 }]),
          },
          label: "knob min:10 with default max:10 -> min >= max",
        },
        {
          input: {
            name: "Bad",
            image: [imageFile()],
            parameters: JSON.stringify([{ key: "k", label: "K", type: "selector", options: [] }]),
          },
          label: "selector options:[]",
        },
      ];

      for (const { input } of cases) {
        const { userId } = await makeUser("r2");
        await expect(
          createPedal(userId, input, storage),
        ).rejects.toBeInstanceOf(PedalError);
      }

      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0].c).toBe(before[0].c);
      const afterFiles = await readdir(dir);
      expect(afterFiles).toEqual(beforeFiles);
    });

    test("R3-c: a legacy pedal row (parameters = '[]') returns parameters:[] from listPedals", async () => {
      const db = getDb();
      const [legacy] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name) VALUES (${`legacy-${crypto.randomUUID()}`}) RETURNING id
      `;

      const listed = await listPedals();
      const found = listed.find((p) => p.id === legacy.id);
      expect(found).toBeDefined();
      expect(found!.parameters).toEqual([]);

      await rm(dir, { recursive: true, force: true });
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

  describe("getPedalImage + hasImage (serve_pedal_catalog_reference_image)", () => {
    test("stores the upload MIME type and serves the bytes with it; hasImage is true", async () => {
      const { userId } = await makeUser("pedal-img");
      const image: UploadedFile = {
        filename: "ref.webp",
        mimeType: "image/webp",
        bytes: new Uint8Array([82, 73, 70, 70, 9]),
      };

      const created = await createPedal(userId, { name: "Webp Pedal", image: [image] }, storage);
      expect(created.hasImage).toBe(true);

      const listed = (await listPedals()).find((p) => p.id === created.id);
      expect(listed!.hasImage).toBe(true);

      const served = await getPedalImage(created.id, storage);
      expect(served.mimeType).toBe("image/webp");
      expect(served.bytes).toEqual(image.bytes);
    });

    test("accepts jpeg/png/webp/gif (case-insensitive, stored lowercase) and rejects other types with no row or bytes", async () => {
      const { userId } = await makeUser("pedal-mime");
      const db = getDb();

      for (const mimeType of ["image/jpeg", "image/png", "image/webp", "image/gif", "IMAGE/PNG"]) {
        const image: UploadedFile = { filename: "ref", mimeType, bytes: new Uint8Array([1]) };
        const created = await createPedal(userId, { name: "Ok", image: [image] }, storage);
        const served = await getPedalImage(created.id, storage);
        expect(served.mimeType).toBe(mimeType.toLowerCase());
      }

      const beforeFiles = await readdir(path.join(dir, "pedals"));
      const before = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      for (const mimeType of ["text/html", "image/svg+xml", "application/octet-stream", ""]) {
        const image: UploadedFile = { filename: "ref", mimeType, bytes: new Uint8Array([60]) };
        const err = await createPedal(userId, { name: "Bad", image: [image] }, storage).catch(
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(PedalError);
        expect((err as PedalError).status).toBe(400);
      }
      const after = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
      expect(after[0]!.c).toBe(before[0]!.c);
      expect(await readdir(path.join(dir, "pedals"))).toEqual(beforeFiles);
    });

    test("a legacy row with an image key but no stored MIME type serves application/octet-stream", async () => {
      const db = getDb();
      const key = `pedals/${crypto.randomUUID()}`;
      await storage.put(key, new Uint8Array([7, 8]));
      const [legacy] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name, reference_image_key)
        VALUES (${`legacy-img-${crypto.randomUUID()}`}, ${key}) RETURNING id
      `;

      const served = await getPedalImage(legacy.id, storage);
      expect(served.mimeType).toBe("application/octet-stream");
      expect(served.bytes).toEqual(new Uint8Array([7, 8]));
    });

    test("404 for a malformed id, an unknown id, a soft-deleted pedal and a pedal without image", async () => {
      const { userId } = await makeUser("pedal-img-404");
      const db = getDb();

      const deleted = await createPedal(userId, { name: "Gone", image: [imageFile()] }, storage);
      await db`UPDATE pedal_catalog SET deleted_at = NOW() WHERE id = ${deleted.id}`;

      const [noImage] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name) VALUES (${`no-img-${crypto.randomUUID()}`}) RETURNING id
      `;
      const listedNoImage = (await listPedals()).find((p) => p.id === noImage.id);
      expect(listedNoImage!.hasImage).toBe(false);

      for (const id of ["not-a-uuid", crypto.randomUUID(), deleted.id, noImage.id]) {
        const err = await getPedalImage(id, storage).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(PedalError);
        expect((err as PedalError).status).toBe(404);
      }
    });
  });
});
