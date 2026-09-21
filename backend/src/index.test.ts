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
