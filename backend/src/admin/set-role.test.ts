import { describe, expect, test } from "bun:test";
import { getDb } from "../db/client";
import { parseSetRoleArgs, runSetRole } from "./set-role";

function silentOut() {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    out: {
      log: (msg: string) => void logs.push(msg),
      error: (msg: string) => void errors.push(msg),
    },
    logs,
    errors,
  };
}

async function insertUser(role: "user" | "admin" = "user"): Promise<{ id: string; email: string }> {
  const email = `set-role-${crypto.randomUUID()}@example.com`;
  const [row] = await getDb()<{ id: string }[]>`
    INSERT INTO users (email, password_hash, role) VALUES (${email}, 'x', ${role}) RETURNING id
  `;
  return { id: row!.id, email };
}

async function roleOf(id: string): Promise<{ role: string; updated_at: Date }> {
  const [row] = await getDb()<{ role: string; updated_at: Date }[]>`
    SELECT role, updated_at FROM users WHERE id = ${id}
  `;
  return row!;
}

describe("parseSetRoleArgs", () => {
  test("accepts exactly <email> <user|admin>", () => {
    expect(parseSetRoleArgs(["a@b.c", "admin"])).toEqual({ email: "a@b.c", role: "admin" });
    expect(parseSetRoleArgs(["a@b.c", "user"])).toEqual({ email: "a@b.c", role: "user" });
    expect(parseSetRoleArgs(["a@b.c", "owner"])).toBeNull();
    expect(parseSetRoleArgs(["", "admin"])).toBeNull();
    expect(parseSetRoleArgs(["a@b.c"])).toBeNull();
    expect(parseSetRoleArgs([])).toBeNull();
    expect(parseSetRoleArgs(["a@b.c", "admin", "x"])).toBeNull();
  });
});

describe("runSetRole (plan_management_admin)", () => {
  test("live user + admin -> exit 0 and role admin (R38)", async () => {
    const user = await insertUser("user");
    const io = silentOut();
    expect(await runSetRole([user.email, "admin"], io.out)).toBe(0);
    expect((await roleOf(user.id)).role).toBe("admin");
    expect(io.logs).toEqual([`role of ${user.email} set to admin`]);
  });

  test("live user + user -> exit 0 and role user (R39)", async () => {
    const user = await insertUser("admin");
    const io = silentOut();
    expect(await runSetRole([user.email, "user"], io.out)).toBe(0);
    expect((await roleOf(user.id)).role).toBe("user");
  });

  test("unknown email -> exit 1 (R40)", async () => {
    const io = silentOut();
    const email = `nobody-${crypto.randomUUID()}@example.com`;
    expect(await runSetRole([email, "admin"], io.out)).toBe(1);
    expect(io.errors).toEqual([`no live user with email ${email}`]);
  });

  test("soft-deleted user's email -> exit 1, row unchanged (R40)", async () => {
    const user = await insertUser("user");
    await getDb()`UPDATE users SET deleted_at = NOW() WHERE id = ${user.id}`;
    const before = await roleOf(user.id);
    const io = silentOut();
    expect(await runSetRole([user.email, "admin"], io.out)).toBe(1);
    expect(await roleOf(user.id)).toEqual(before);
  });

  test("bad role or wrong arg count -> exit 1, role unchanged (R41)", async () => {
    const user = await insertUser("user");
    const before = await roleOf(user.id);
    for (const argv of [[user.email, "owner"], [user.email], [user.email, "admin", "x"]]) {
      const io = silentOut();
      expect(await runSetRole(argv, io.out)).toBe(1);
      expect(io.errors).toEqual(["usage: bun run set-role <email> <user|admin>"]);
    }
    expect(await roleOf(user.id)).toEqual(before);
  });
});
