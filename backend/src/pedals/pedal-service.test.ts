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
    brand: "Test Brand",
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
          brand: "Big Brand",
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

    describe("createPedal brand validation (pedal_catalog_metadata R3)", () => {
      const cases: Array<{
        label: string;
        brand: string | null | undefined;
        expectStatus?: number;
        expectError?: string;
      }> = [
        { label: "a: absent", brand: undefined, expectStatus: 400, expectError: "brand is required" },
        { label: "b: empty string", brand: "", expectStatus: 400, expectError: "brand is required" },
        { label: "c: whitespace-only", brand: "   ", expectStatus: 400, expectError: "brand is required" },
        { label: "d: null (sent twice or as a file)", brand: null, expectStatus: 400, expectError: "brand is required" },
        { label: "e: 256 characters", brand: "x".repeat(256), expectStatus: 400, expectError: "brand must be at most 255 characters" },
        { label: "f: trimmed on insert", brand: "  Boss  " },
        { label: "g: 255 non-ASCII characters", brand: "é".repeat(255) },
      ];

      for (const { label, brand, expectStatus, expectError } of cases) {
        test(label, async () => {
          const { userId } = await makeUser(`r3-${label.replace(/[^a-z0-9]/gi, "")}`);
          const db = getDb();
          const beforeCount = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
          const beforeFiles = await readdir(dir);

          const result = createPedal(
            userId,
            {
              name: "R3 Pedal",
              image: [imageFile()],
              brand,
            },
            storage,
          );
          if (expectStatus !== undefined) {
            const err = await result.catch((e: unknown) => e);
            expect(err).toBeInstanceOf(PedalError);
            expect((err as PedalError).status).toBe(expectStatus);
            expect((err as PedalError).message).toBe(expectError);
            const afterCount = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
            expect(afterCount[0]!.c).toBe(beforeCount[0]!.c);
            expect(await readdir(dir)).toEqual(beforeFiles);
          } else {
            const dto = await result;
            expect(dto.brand).toBe(brand === "  Boss  " ? "Boss" : brand);
            expect(dto.brand.length).toBeLessThanOrEqual(255);
          }
        });
      }
    });

    describe("createPedal description (pedal_catalog_metadata R4)", () => {
      const cases: Array<{
        label: string;
        description: string | null | undefined;
        expectStatus?: number;
        expectError?: string;
        expectedDescription: string | null;
      }> = [
        { label: "a: absent", description: undefined, expectedDescription: null },
        { label: "b1: empty string", description: "", expectedDescription: null },
        { label: "b2: whitespace-only", description: "   ", expectedDescription: null },
        { label: "c: trimmed on insert", description: "  Classic overdrive  ", expectedDescription: "Classic overdrive" },
        { label: "d: 2000 characters", description: "y".repeat(2000), expectedDescription: "y".repeat(2000) },
        { label: "e: 2001 characters", description: "y".repeat(2001), expectStatus: 400, expectError: "description must be at most 2000 characters", expectedDescription: null },
        { label: "f: null (sent twice or as a file)", description: null, expectStatus: 400, expectError: "description must be a single text field", expectedDescription: null },
      ];

      for (const { label, description, expectStatus, expectError, expectedDescription } of cases) {
        test(label, async () => {
          const { userId } = await makeUser(`r4-${label.replace(/[^a-z0-9]/gi, "")}`);
          const db = getDb();
          const beforeCount = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
          const beforeFiles = await readdir(dir);

          const result = createPedal(
            userId,
            {
              name: "R4 Pedal",
              image: [imageFile()],
              brand: "R4 Brand",
              description,
            },
            storage,
          );
          if (expectStatus !== undefined) {
            const err = await result.catch((e: unknown) => e);
            expect(err).toBeInstanceOf(PedalError);
            expect((err as PedalError).status).toBe(expectStatus);
            expect((err as PedalError).message).toBe(expectError);
            const afterCount = await db<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM pedal_catalog`;
            expect(afterCount[0]!.c).toBe(beforeCount[0]!.c);
            expect(await readdir(dir)).toEqual(beforeFiles);
          } else {
            const dto = await result;
            expect(dto.description).toBe(expectedDescription);
          }
        });
      }
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
          brand: "R1a Brand",
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
        { name: "R1c Pedal", brand: "R1c Brand", image: [imageFile()] },
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
        { name: "R1d Pedal", brand: "R1d Brand", image: [imageFile()], parameters: "[]" },
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
          brand: "R1e Brand",
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
        { input: { name: "Bad", brand: "Bad Brand", image: [imageFile()], parameters: null }, label: "parameters=null" },
        {
          input: { name: "Bad", brand: "Bad Brand", image: [imageFile()], parameters: "{" },
          label: "invalid JSON",
        },
        {
          input: { name: "Bad", brand: "Bad Brand", image: [imageFile()], parameters: JSON.stringify({ a: 1 }) },
          label: "value is not an array",
        },
        {
          input: {
            name: "Bad",
            brand: "Bad Brand",
            image: [imageFile()],
            parameters: JSON.stringify([{ key: "k", label: "K", type: "knob", min: 10 }]),
          },
          label: "knob min:10 with default max:10 -> min >= max",
        },
        {
          input: {
            name: "Bad",
            brand: "Bad Brand",
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
        INSERT INTO pedal_catalog (name, brand) VALUES (${`legacy-${crypto.randomUUID()}`}, 'Test Brand') RETURNING id
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

      const created = await createPedal(userId, { name: "Webp Pedal", brand: "Webp Brand", image: [image] }, storage);
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
        const created = await createPedal(userId, { name: "Ok", brand: "Ok Brand", image: [image] }, storage);
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
        INSERT INTO pedal_catalog (name, brand, reference_image_key)
        VALUES (${`legacy-img-${crypto.randomUUID()}`}, 'Test Brand', ${key}) RETURNING id
      `;

      const served = await getPedalImage(legacy.id, storage);
      expect(served.mimeType).toBe("application/octet-stream");
      expect(served.bytes).toEqual(new Uint8Array([7, 8]));
    });

    test("404 for a malformed id, an unknown id, a soft-deleted pedal and a pedal without image", async () => {
      const { userId } = await makeUser("pedal-img-404");
      const db = getDb();

      const deleted = await createPedal(userId, { name: "Gone", brand: "Gone Brand", image: [imageFile()] }, storage);
      await db`UPDATE pedal_catalog SET deleted_at = NOW() WHERE id = ${deleted.id}`;

      const [noImage] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name, brand) VALUES (${`no-img-${crypto.randomUUID()}`}, 'Test Brand') RETURNING id
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

  describe("new pedals are editable with empty extras (pedal_catalog_metadata R5)", () => {
    test("a pedal created via createPedal has isEditable: true and extras: {} (R5-a)", async () => {
      const { userId } = await makeUser("r5a");
      const dto = await createPedal(
        userId,
        { name: "R5a Pedal", image: [imageFile()], brand: "R5a Brand" },
        storage,
      );
      expect(dto.isEditable).toBe(true);
      expect(dto.extras).toEqual({});
    });
  });

  describe("pedal DTO exposes brand/description/extras/isEditable/canEdit (pedal_catalog_metadata R6)", () => {
    test("createPedal DTO exposes the five new fields and no snake_case (R6-a, R6-d)", async () => {
      const { userId } = await makeUser("r6a");
      const dto = await createPedal(
        userId,
        {
          name: "R6a Pedal",
          image: [imageFile()],
          brand: "R6a Brand",
          description: "R6a description",
        },
        storage,
      );
      expect(dto.brand).toBe("R6a Brand");
      expect(dto.description).toBe("R6a description");
      expect(dto.extras).toEqual({});
      expect(dto.isEditable).toBe(true);
      expect(dto.canEdit).toBe(true);
      expect(dto).not.toHaveProperty("is_editable");
      expect(dto).not.toHaveProperty("can_edit");
      expect(dto).not.toHaveProperty("reference_image_key");
    });

    test("listPedals returns a backfilled legacy row with brand Valeton, description null, extras {}, isEditable true (R6-c)", async () => {
      const db = getDb();
      const [legacy] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name, brand, reference_image_key)
        VALUES (${`legacy-r6-${crypto.randomUUID()}`}, 'Valeton', NULL) RETURNING id
      `;
      const found = (await listPedals()).find((p) => p.id === legacy!.id);
      expect(found).toBeDefined();
      expect(found!.brand).toBe("Valeton");
      expect(found!.description).toBeNull();
      expect(found!.extras).toEqual({});
      expect(found!.isEditable).toBe(true);
      expect(found!.canEdit).toBe(true);
    });

    test("neither endpoint exposes snake_case brand/description/extras/isEditable/canEdit keys (R6-d)", async () => {
      const { userId } = await makeUser("r6d");
      const dto = await createPedal(
        userId,
        { name: "R6d Pedal", image: [imageFile()], brand: "R6d Brand" },
        storage,
      );
      const keys = Object.keys(dto);
      expect(keys).not.toContain("is_editable");
      expect(keys).not.toContain("can_edit");
      expect(keys).not.toContain("reference_image_key");
      expect(keys).toContain("isEditable");
      expect(keys).toContain("canEdit");
      expect(keys).toContain("brand");
      expect(keys).toContain("description");
      expect(keys).toContain("extras");
    });
  });

  describe("canEdit (pedal_catalog_metadata R7)", () => {
    async function seedSongAndConfigRow(
      userId: string,
      pedalId: string,
      opts: { softDeleteSong?: boolean; softDeleteConfig?: boolean } = {},
    ): Promise<void> {
      const db = getDb();
      const [song] = await db<{ id: string }[]>`
        INSERT INTO songs (user_id, name) VALUES (${userId}, 'CanEdit Song') RETURNING id
      `;
      if (opts.softDeleteSong) await db`UPDATE songs SET deleted_at = NOW() WHERE id = ${song!.id}`;
      const [config] = await db<{ id: string }[]>`
        INSERT INTO song_pedal_configs (song_id, user_id, pedal_catalog_id, label)
        VALUES (${song!.id}, ${userId}, ${pedalId}, 'cfg') RETURNING id
      `;
      if (opts.softDeleteConfig) await db`UPDATE song_pedal_configs SET deleted_at = NOW() WHERE id = ${config!.id}`;
    }

    test.each([
      { label: "a: editable, no config", expectCanEdit: true },
      { label: "b: editable, live config on caller's song", expectCanEdit: false, softDeleteSong: false },
      { label: "c: editable, live config on another user's song", expectCanEdit: false, otherUserConfig: true },
      { label: "d: editable, only soft-deleted configs", expectCanEdit: true, softDeleteConfig: true },
      { label: "e: editable, live config on soft-deleted song", expectCanEdit: true, softDeleteSong: true },
      { label: "f: not editable, no configs", expectCanEdit: false, lockEditable: true, noConfig: true },
      { label: "g: not editable, attached", expectCanEdit: false, lockEditable: true },
    ])("$label -> canEdit $expectCanEdit", async ({ expectCanEdit, softDeleteSong, softDeleteConfig, otherUserConfig, lockEditable, noConfig }) => {
      const { userId } = await makeUser(`r7-${Math.random()}`);
      const db = getDb();
      const name = `r7-pedal-${crypto.randomUUID()}`;
      const [pedal] = await db<{ id: string }[]>`
        INSERT INTO pedal_catalog (name, brand, reference_image_key)
        VALUES (${name}, 'Test Brand', NULL) RETURNING id
      `;
      if (lockEditable) {
        await db`UPDATE pedal_catalog SET is_editable = false WHERE id = ${pedal!.id}`;
      }

      const skipConfig = expectCanEdit === true && !softDeleteSong && !softDeleteConfig && !otherUserConfig && !lockEditable || noConfig === true;
      if (!skipConfig) {
        const liveUserId = otherUserConfig ? (await makeUser("r7-other")).userId : userId;
        await seedSongAndConfigRow(liveUserId, pedal!.id, { softDeleteSong, softDeleteConfig });
      }

      const found = (await listPedals()).find((p) => p.id === pedal!.id);
      expect(found).toBeDefined();
      expect(found!.canEdit).toBe(expectCanEdit);
    });
  });
});
