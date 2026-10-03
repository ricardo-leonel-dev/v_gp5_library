import { describe, expect, test } from "bun:test";
import { getDb } from "./db/client";
import { issueToken } from "./auth/jwt";
import { MAX_EXTRA_CONFIG_BYTES } from "./songs/song-service";
import { loadFixture, PRESET_FIXTURES } from "./songs/fixtures";
import { resolveAllowedOrigins } from "./config/stage";
import app from "./index";

const allowedOrigin = resolveAllowedOrigins()[0];

const fixtureBytes = await Promise.all(PRESET_FIXTURES.map((f) => loadFixture(f.file)));

function presetPart(index = 0, filename = "p.prst"): File {
  return new File([new Uint8Array(fixtureBytes[index]!)], filename, {
    type: "application/octet-stream",
  });
}

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

    const presetBytes = new Uint8Array(fixtureBytes[0]!);
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

describe("POST /songs oversized extra_config -> 400 (R4)", () => {
  test("end-to-end multipart request with extra_config byte length > MAX_EXTRA_CONFIG_BYTES returns 400", async () => {
    const db = getDb();
    const email = `oversize-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const oversized = `{"note":"${"x".repeat(MAX_EXTRA_CONFIG_BYTES)}"}`;
    expect(new TextEncoder().encode(oversized).length).toBeGreaterThan(MAX_EXTRA_CONFIG_BYTES);

    const fd = new FormData();
    fd.append("name", "Too big");
    fd.append("extra_config", oversized);
    fd.append(
      "preset",
      new File([new Uint8Array([1, 2, 3])], "p.syx", { type: "application/octet-stream" }),
    );

    const res = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain(String(MAX_EXTRA_CONFIG_BYTES));
  });
});

describe("POST /songs then GET /songs/:id extra_config round-trip (R2)", () => {
  test("nontrivial extra_config JSON object round-trips through the full HTTP stack unchanged", async () => {
    const db = getDb();
    const email = `rt-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const original = {
      tuning: "Drop D",
      capo: 2,
      notes: ["verse 1: clean", "chorus: lead"],
      mix: { reverb: 0.3, delay: null },
      active: true,
    };

    const fd = new FormData();
    fd.append("name", "Round trip E2E");
    fd.append("extra_config", JSON.stringify(original));
    fd.append("preset", presetPart());

    const createRes = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; extraConfig: Record<string, unknown> };
    expect(created.extraConfig).toEqual(original);

    const getRes = await app.request(`/songs/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { id: string; extraConfig: Record<string, unknown> };
    expect(fetched.id).toBe(created.id);
    expect(fetched.extraConfig).toEqual(original);
  });
});

describe("POST /songs free-plan over-limit -> 402 (R2, R3)", () => {
  test("free-plan user's 11th POST /songs (after 10 successes) returns 402 with error naming the limit", async () => {
    const db = getDb();
    const email = `plan-cap-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    for (let i = 0; i < 10; i++) {
      const fd = new FormData();
      fd.append("name", `Cap Song ${i}`);
      fd.append("preset", presetPart(0, `p${i}.prst`));
      const res = await app.request("/songs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      expect(res.status).toBe(201);
    }

    const overFd = new FormData();
    overFd.append("name", "Over the cap");
    overFd.append("preset", presetPart(0, "over.prst"));
    const overRes = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: overFd,
    });
    expect(overRes.status).toBe(402);
    const body = (await overRes.json()) as { error: string };
    expect(body.error).toContain("free");
    expect(body.error).toContain("10");
  });
});

describe("POST /songs plan from token claim is ignored — DB governs (R6)", () => {
  test("token issued as 'paid' for a user whose users.plan is 'free' is still capped at 10 songs", async () => {
    const db = getDb();
    const email = `plan-stale-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    // Stale token claim: token says paid, but users.plan is free (default).
    const token = await issueToken(user.id, "paid");

    for (let i = 0; i < 10; i++) {
      const fd = new FormData();
      fd.append("name", `Stale Song ${i}`);
      fd.append("preset", presetPart(0, `s${i}.prst`));
      const res = await app.request("/songs", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      expect(res.status).toBe(201);
    }

    const overFd = new FormData();
    overFd.append("name", "Over the stale cap");
    overFd.append("preset", presetPart(0, "over.prst"));
    const overRes = await app.request("/songs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: overFd,
    });
    expect(overRes.status).toBe(402);
    const body = (await overRes.json()) as { error: string };
    expect(body.error).toContain("free");
    expect(body.error).toContain("10");
  });
});

describe("CORS middleware end-to-end against real app (R6, R7, R10, R11, R12)", () => {
  test("preflight OPTIONS /auth/register from allowed origin -> 204 with Allow-Origin", async () => {
    const res = await app.request("/auth/register", {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  test("preflight OPTIONS /songs from allowed origin -> 204 (not 401) with Allow-Origin", async () => {
    const res = await app.request("/songs", {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  test("POST /auth/login with an empty JSON body -> handler's 400 with Allow-Origin", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { Origin: allowedOrigin, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  test("GET /songs without a token -> 401 with Allow-Origin", async () => {
    const res = await app.request("/songs", {
      headers: { Origin: allowedOrigin },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });
});

describe("unknown-route guard end-to-end against real app (R1, R2, R5, R6, R8, R9, R17)", () => {
  test("GET /definitely-not-a-route with no token -> 404 JSON {error:'Not found'}", async () => {
    const res = await app.request("/definitely-not-a-route");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("GET /definitely-not-a-route with a valid token -> 404 JSON {error:'Not found'}", async () => {
    const db = getDb();
    const email = `unk-guard-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const res = await app.request("/definitely-not-a-route", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("PUT /songs (method mismatch on known path) with no token -> 401", async () => {
    const res = await app.request("/songs", { method: "PUT" });
    expect(res.status).toBe(401);
  });

  test("PUT /songs (method mismatch on known path) with a valid token -> 404 JSON {error:'Not found'}", async () => {
    const db = getDb();
    const email = `unk-mismatch-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const token = await issueToken(user.id, "free");

    const res = await app.request("/songs", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("GET /songs with no token -> 401 (regression, known path still requires auth)", async () => {
    const res = await app.request("/songs");
    expect(res.status).toBe(401);
  });

  test("POST /auth/login with an empty JSON body and no token -> 400 (neither 401 nor 404)", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(404);
  });
});

async function makeUserToken(prefix: string): Promise<{ userId: string; token: string }> {
  const db = getDb();
  const email = `${prefix}-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
  `;
  return { userId: user!.id, token: await issueToken(user!.id, "free") };
}

interface PresetBody {
  id: string;
  sortOrder: number;
  name: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

interface SongBody {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: Array<{ kind: string }>;
  presets: PresetBody[];
}

async function postSong(token: string, fd: FormData): Promise<Response> {
  return app.request("/songs", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

async function createThreePresetSong(token: string, sendOrder = [0, 1, 2]): Promise<SongBody> {
  const fd = new FormData();
  fd.append("name", "Three presets");
  for (const i of sendOrder) fd.append("preset", presetPart(i, PRESET_FIXTURES[i]!.file));
  const res = await postSong(token, fd);
  expect(res.status).toBe(201);
  return (await res.json()) as SongBody;
}

describe("POST /songs ignores pedal_preset_name parts (multiple_presets_per_song R18)", () => {
  test("a pedal_preset_name=Bogus part -> 201, name read from bytes, same stored rows/body as without it", async () => {
    const { token } = await makeUserToken("mpps-r18");
    const db = getDb();

    const build = (withBogus: boolean): FormData => {
      const fd = new FormData();
      fd.append("name", "Ignored field");
      fd.append("artist", "Someone");
      fd.append("preset", presetPart(1, "one.prst"));
      if (withBogus) {
        fd.append("pedal_preset_name", "Bogus");
        fd.append("pedal_preset_name", "Bogus 2");
      }
      return fd;
    };

    const withRes = await postSong(token, build(true));
    expect(withRes.status).toBe(201);
    const withBody = (await withRes.json()) as SongBody & Record<string, unknown>;
    expect(withBody.presets[0]!.name).toBe(PRESET_FIXTURES[1].name);
    expect(withBody).not.toHaveProperty("pedalPresetName");

    const [row] = await db<{ pedal_preset_name: string }[]>`
      SELECT pedal_preset_name FROM song_files
      WHERE song_id = ${withBody.id} AND kind = 'preset' AND deleted_at IS NULL
    `;
    expect(row!.pedal_preset_name).toBe(PRESET_FIXTURES[1].name);

    const withoutRes = await postSong(token, build(false));
    expect(withoutRes.status).toBe(201);
    const withoutBody = (await withoutRes.json()) as SongBody;

    const normalize = (b: SongBody) => ({
      ...b,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      presets: b.presets.map((p) => ({ ...p, id: undefined, createdAt: undefined })),
    });
    expect(normalize(withBody)).toEqual(normalize(withoutBody));
  });
});

describe("POST /songs with 3 repeated preset parts (multiple_presets_per_song R12, R13, R19)", () => {
  test("the 201 body's presets order and names match the send order", async () => {
    const { token } = await makeUserToken("mpps-r13");
    const sendOrder = [2, 0, 1];
    const body = await createThreePresetSong(token, sendOrder);

    expect(body.files).toEqual([]);
    expect(body.presets.map((p) => [p.sortOrder, p.name, p.originalFilename])).toEqual(
      sendOrder.map((i, pos) => [pos, PRESET_FIXTURES[i]!.name, PRESET_FIXTURES[i]!.file]),
    );

    const listRes = await app.request("/songs", { headers: { Authorization: `Bearer ${token}` } });
    const list = (await listRes.json()) as SongBody[];
    expect(list.find((s) => s.id === body.id)!.presets.map((p) => p.name)).toEqual(
      sendOrder.map((i) => PRESET_FIXTURES[i]!.name),
    );
  });
});

describe("GET /songs/:id/files/preset with several presets (multiple_presets_per_song R26, R27, R28)", () => {
  test("sort_order=0|1|2 returns each fixture's bytes, omitted -> preset 0, sort_order=3 -> 404", async () => {
    const { token } = await makeUserToken("mpps-export");
    const song = await createThreePresetSong(token);
    const auth = { Authorization: `Bearer ${token}` };

    for (const [i, f] of PRESET_FIXTURES.entries()) {
      const res = await app.request(`/songs/${song.id}/files/preset?sort_order=${i}`, { headers: auth });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="${f.file}"`);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(fixtureBytes[i]);
    }

    const dflt = await app.request(`/songs/${song.id}/files/preset`, { headers: auth });
    expect(dflt.status).toBe(200);
    expect(new Uint8Array(await dflt.arrayBuffer())).toEqual(fixtureBytes[0]);

    const missing = await app.request(`/songs/${song.id}/files/preset?sort_order=3`, { headers: auth });
    expect(missing.status).toBe(404);
  });
});

describe("no mutation of an existing song's presets (multiple_presets_per_song R29)", () => {
  test("PUT/PATCH /songs/:id and POST/PUT/PATCH/DELETE /songs/:id/files/preset -> 404, presets unchanged", async () => {
    const { token } = await makeUserToken("mpps-r29");
    const song = await createThreePresetSong(token);
    const db = getDb();
    const auth = { Authorization: `Bearer ${token}` };

    const snapshot = async () =>
      db<{ id: string; sort_order: number; pedal_preset_name: string; storage_key: string }[]>`
        SELECT id, sort_order, pedal_preset_name, storage_key FROM song_files
        WHERE song_id = ${song.id} AND kind = 'preset' AND deleted_at IS NULL
        ORDER BY sort_order
      `;
    const before = await snapshot();
    expect(before).toHaveLength(3);

    const attempts: Array<[string, string]> = [
      ["PUT", `/songs/${song.id}`],
      ["PATCH", `/songs/${song.id}`],
      ["POST", `/songs/${song.id}/files/preset`],
      ["PUT", `/songs/${song.id}/files/preset`],
      ["PATCH", `/songs/${song.id}/files/preset`],
      ["DELETE", `/songs/${song.id}/files/preset`],
    ];
    for (const [method, url] of attempts) {
      const fd = new FormData();
      fd.append("name", "Mutated");
      fd.append("preset", presetPart(2, "replacement.prst"));
      const res = await app.request(url, { method, headers: auth, body: fd });
      expect([method, url, res.status]).toEqual([method, url, 404]);
    }

    expect(await snapshot()).toEqual(before);
    for (const [i] of PRESET_FIXTURES.entries()) {
      const res = await app.request(`/songs/${song.id}/files/preset?sort_order=${i}`, { headers: auth });
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(fixtureBytes[i]);
    }
    const getRes = await app.request(`/songs/${song.id}`, { headers: auth });
    const fetched = (await getRes.json()) as SongBody;
    expect(fetched.name).toBe("Three presets");
    expect(fetched.presets.map((p) => p.id)).toEqual(song.presets.map((p) => p.id));
  });
});
