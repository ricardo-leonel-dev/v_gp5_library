import { describe, expect, test } from "bun:test";
import { getDb } from "./db/client";
import { issueToken } from "./auth/jwt";
import app from "./index";

describe("GET /health", () => {
  test("reports ok when the DB is reachable", async () => {
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("GET /songs/:id/files/:kind (R1, R2, R3, R4)", () => {
  test("end-to-end round trip: preset + ir bytes match headers + bodies", async () => {
    const db = getDb();
    const email = `getfile-e2e-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const presetBytes = new Uint8Array([42, 43, 44, 45]);
    const irZeroBytes = new Uint8Array([100, 101]);
    const irOneBytes = new Uint8Array([200, 201, 202]);

    const fd = new FormData();
    fd.append("name", "File Export");
    fd.append("preset", new File([presetBytes], "lead.syx", { type: "application/octet-stream" }));
    fd.append("ir", new File([irZeroBytes], "cab-zero.dat", { type: "application/octet-stream" }));
    fd.append("ir", new File([irOneBytes], "cab-one.dat", { type: "application/octet-stream" }));

    const createRes = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };
    const songId = created.id;

    const presetRes = await app.request(`/songs/${songId}/files/preset`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(presetRes.status).toBe(200);
    expect(presetRes.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(presetRes.headers.get("Content-Disposition")).toBe('attachment; filename="lead.syx"');
    const presetOut = new Uint8Array(await presetRes.arrayBuffer());
    expect(presetOut).toEqual(presetBytes);

    const irZeroRes = await app.request(`/songs/${songId}/files/ir?sort_order=0`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(irZeroRes.status).toBe(200);
    expect(irZeroRes.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(irZeroRes.headers.get("Content-Disposition")).toBe('attachment; filename="cab-zero.dat"');
    expect(new Uint8Array(await irZeroRes.arrayBuffer())).toEqual(irZeroBytes);

    const irOneRes = await app.request(`/songs/${songId}/files/ir?sort_order=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(irOneRes.status).toBe(200);
    expect(irOneRes.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(irOneRes.headers.get("Content-Disposition")).toBe('attachment; filename="cab-one.dat"');
    expect(new Uint8Array(await irOneRes.arrayBuffer())).toEqual(irOneBytes);
  });
});

describe("GET /songs/:id/files/:kind auth (R10)", () => {
  test("without bearer token -> 401", async () => {
    const res = await app.request(`/songs/${crypto.randomUUID()}/files/preset`);
    expect(res.status).toBe(401);
  });
});

describe("/pedals auth (R5)", () => {
  test("POST /pedals without bearer -> 401", async () => {
    const fd = new FormData();
    fd.append("name", "x");
    fd.append("image", new File([new Uint8Array([1])], "p.png"));
    const res = await app.request("/pedals", { method: "POST", body: fd });
    expect(res.status).toBe(401);
  });

  test("GET /pedals without bearer -> 401", async () => {
    const res = await app.request("/pedals");
    expect(res.status).toBe(401);
  });
});

describe("POST /pedals end-to-end via app.request (R1)", () => {
  test("multipart FormData with name + image returns 201 with pedal shape (no reference_image_key)", async () => {
    const db = getDb();
    const email = `pedal-e2e-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const fd = new FormData();
    fd.append("name", "Boss DS-1");
    fd.append(
      "image",
      new File([new Uint8Array([10, 20, 30, 40])], "ds1.png", { type: "image/png" }),
    );

    const res = await app.request("/pedals", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      name: string;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
    };
    expect(body.name).toBe("Boss DS-1");
    expect(body.createdBy).toBe(user.id);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(body).not.toHaveProperty("reference_image_key");
  });
});

describe("GET /pedals shared catalog across users (R6)", () => {
  test("POST as user A, then GET as user B returns A's pedal in the list", async () => {
    const db = getDb();
    const emailA = `pedal-shared-A-${crypto.randomUUID()}@example.com`;
    const emailB = `pedal-shared-B-${crypto.randomUUID()}@example.com`;
    const [userA] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailA}, 'x') RETURNING id
    `;
    const [userB] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailB}, 'x') RETURNING id
    `;
    const tokenA = await issueToken(userA.id, "free");
    const tokenB = await issueToken(userB.id, "free");

    const fd = new FormData();
    fd.append("name", "Shared Pedal");
    fd.append("image", new File([new Uint8Array([5, 5, 5])], "shared.png", { type: "image/png" }));
    const createRes = await app.request("/pedals", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: fd,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; createdBy: string };
    expect(created.createdBy).toBe(userA.id);

    const listRes = await app.request("/pedals", {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as Array<{ id: string; createdBy: string }>;
    expect(listed.map((p) => p.id)).toContain(created.id);
    const found = listed.find((p) => p.id === created.id);
    expect(found).toBeDefined();
    expect(found!.createdBy).toBe(userA.id);
  });
});

describe("/songs/:id/pedals auth (R9)", () => {
  test("POST without bearer -> 401", async () => {
    const res = await app.request(`/songs/${crypto.randomUUID()}/pedals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedal_catalog_id: crypto.randomUUID(), label: "x" }),
    });
    expect(res.status).toBe(401);
  });

  test("GET without bearer -> 401", async () => {
    const res = await app.request(`/songs/${crypto.randomUUID()}/pedals`);
    expect(res.status).toBe(401);
  });

  test("DELETE without bearer -> 401", async () => {
    const res = await app.request(
      `/songs/${crypto.randomUUID()}/pedals/${crypto.randomUUID()}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(401);
  });
});

async function seedSongAndPedal(userId: string): Promise<{ songId: string; pedalId: string }> {
  const db = getDb();
  const [song] = await db<{ id: string }[]>`
    INSERT INTO songs (user_id, name) VALUES (${userId}, 'E2E Song') RETURNING id
  `;
  const [pedal] = await db<{ id: string }[]>`
    INSERT INTO pedal_catalog (name, reference_image_key) VALUES ('E2E Pedal', NULL) RETURNING id
  `;
  return { songId: song.id, pedalId: pedal.id };
}

describe("POST /songs/:id/pedals end-to-end via app.request (R1)", () => {
  test("JSON body with label + pedal_catalog_id + config returns 201 with expected shape", async () => {
    const db = getDb();
    const email = `spc-e2e-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");
    const { songId, pedalId } = await seedSongAndPedal(user.id);

    const res = await app.request(`/songs/${songId}/pedals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pedal_catalog_id: pedalId,
        label: "Lead Crunch",
        config: { gain: 6, tone: "warm" },
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      songId: string;
      pedalCatalogId: string;
      label: string;
      config: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.songId).toBe(songId);
    expect(body.pedalCatalogId).toBe(pedalId);
    expect(body.label).toBe("Lead Crunch");
    expect(body.config).toEqual({ gain: 6, tone: "warm" });
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
  });
});

describe("POST /songs/:id/pedals as foreign user -> 404 (R3)", () => {
  test("user B posting to user A's song returns 404", async () => {
    const db = getDb();
    const emailA = `spc-iso-A-${crypto.randomUUID()}@example.com`;
    const emailB = `spc-iso-B-${crypto.randomUUID()}@example.com`;
    const [userA] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailA}, 'x') RETURNING id
    `;
    const [userB] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailB}, 'x') RETURNING id
    `;
    const tokenB = await issueToken(userB.id, "free");
    const { songId: songA, pedalId } = await seedSongAndPedal(userA.id);

    const res = await app.request(`/songs/${songA}/pedals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenB}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pedal_catalog_id: pedalId, label: "sneak" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /songs/:id/pedals per-user isolation (R10)", () => {
  test("user A and user B each creating a row on their own song referencing the same pedal_catalog_id: A's GET only contains A's row", async () => {
    const db = getDb();
    const emailA = `spc-cross-A-${crypto.randomUUID()}@example.com`;
    const emailB = `spc-cross-B-${crypto.randomUUID()}@example.com`;
    const [userA] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailA}, 'x') RETURNING id
    `;
    const [userB] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${emailB}, 'x') RETURNING id
    `;
    const tokenA = await issueToken(userA.id, "free");

    const { songId: songA, pedalId } = await seedSongAndPedal(userA.id);
    const { songId: songB } = await seedSongAndPedal(userB.id);

    const createA = await app.request(`/songs/${songA}/pedals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pedal_catalog_id: pedalId, label: "A's config" }),
    });
    expect(createA.status).toBe(201);
    const aConfigId = ((await createA.json()) as { id: string }).id;

    const [bConfig] = await db<{ id: string }[]>`
      INSERT INTO song_pedal_configs (song_id, user_id, pedal_catalog_id, label)
      VALUES (${songB}, ${userB.id}, ${pedalId}, 'B config (same shared pedal)')
      RETURNING id
    `;

    const listRes = await app.request(`/songs/${songA}/pedals`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as Array<{ id: string; label: string }>;
    const ids = listed.map((c) => c.id);
    expect(ids).toContain(aConfigId);
    expect(ids).not.toContain(bConfig.id);
    expect(listed.every((c) => c.label.startsWith("A"))).toBe(true);
  });
});

describe("POST then DELETE then GET round trip (R12)", () => {
  test("after DELETE the config no longer appears in GET /songs/:id/pedals", async () => {
    const db = getDb();
    const email = `spc-del-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");
    const { songId, pedalId } = await seedSongAndPedal(user.id);

    const createRes = await app.request(`/songs/${songId}/pedals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pedal_catalog_id: pedalId, label: "Delete me" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const listBefore = await app.request(`/songs/${songId}/pedals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const idsBefore = ((await listBefore.json()) as Array<{ id: string }>).map((c) => c.id);
    expect(idsBefore).toContain(created.id);

    const delRes = await app.request(`/songs/${songId}/pedals/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status).toBe(204);

    const listAfter = await app.request(`/songs/${songId}/pedals`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const idsAfter = ((await listAfter.json()) as Array<{ id: string }>).map((c) => c.id);
    expect(idsAfter).not.toContain(created.id);
  });
});
