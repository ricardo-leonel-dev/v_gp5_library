import { describe, expect, test } from "bun:test";
import { getDb } from "../db/client";
import {
  PLAN_LIMITS,
  PlanError,
  PlanLimitError,
  checkPlanLimits,
  getPlanSummary,
  isPlan,
  setUserPlan,
  type Plan,
  type PlanLimitCode,
} from "./plan-service";

function expectLimitError(
  fn: () => void,
  code: PlanLimitCode,
  plan: Plan,
  limit: number,
): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(PlanLimitError);
  const err = caught as PlanLimitError;
  expect(err.status).toBe(402);
  expect(err.code).toBe(code);
  expect(err.plan).toBe(plan);
  expect(err.limit).toBe(limit);
  expect(err.message.length).toBeGreaterThan(0);
}

describe("PLAN_LIMITS", () => {
  test("matches the tier table (R21, R22, R23)", () => {
    expect(PLAN_LIMITS).toEqual({
      free: { songs: 1, presetsPerSong: 1 },
      basic: { songs: 2, presetsPerSong: 2 },
      premium: { songs: null, presetsPerSong: null },
    });
  });
});

describe("checkPlanLimits", () => {
  test("free: 0 songs, 1 preset is allowed (R6)", () => {
    expect(() => checkPlanLimits("free", 0, 1)).not.toThrow();
  });

  test("free: 1 live song -> plan_song_limit, limit 1 (R7, R15)", () => {
    expectLimitError(() => checkPlanLimits("free", 1, 1), "plan_song_limit", "free", 1);
  });

  test("free: 0 songs, 2 presets -> plan_preset_limit, limit 1 (R11, R15)", () => {
    expectLimitError(() => checkPlanLimits("free", 0, 2), "plan_preset_limit", "free", 1);
  });

  test("free: 1 song + 2 presets -> plan_song_limit wins (R13)", () => {
    expectLimitError(() => checkPlanLimits("free", 1, 2), "plan_song_limit", "free", 1);
  });

  test("basic: 1 song, 2 presets is allowed (R8)", () => {
    expect(() => checkPlanLimits("basic", 1, 2)).not.toThrow();
  });

  test("basic: 2 live songs -> plan_song_limit, limit 2 (R9)", () => {
    expectLimitError(() => checkPlanLimits("basic", 2, 1), "plan_song_limit", "basic", 2);
  });

  test("basic: 1 song, 3 presets -> plan_preset_limit, limit 2 (R12)", () => {
    expectLimitError(() => checkPlanLimits("basic", 1, 3), "plan_preset_limit", "basic", 2);
  });

  test("premium: 100 songs, 50 presets is allowed (R10)", () => {
    expect(() => checkPlanLimits("premium", 100, 50)).not.toThrow();
  });
});

describe("getPlanSummary", () => {
  test("returns plan, limits and live-song usage, excluding soft-deleted songs (R20, R24, R18)", async () => {
    const db = getDb();
    const [row] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash, plan)
      VALUES (${`plan-svc-${crypto.randomUUID()}@example.com`}, 'x', 'basic') RETURNING id
    `;
    const user = row!;
    await db`INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Live')`;
    await db`INSERT INTO songs (user_id, name, deleted_at) VALUES (${user.id}, 'Gone', NOW())`;

    expect(await getPlanSummary(user.id)).toEqual({
      plan: "basic",
      limits: { songs: 2, presetsPerSong: 2 },
      usage: { songs: 1 },
    });
  });

  test("unknown user -> PlanError 404 (R26)", async () => {
    let caught: unknown;
    try {
      await getPlanSummary(crypto.randomUUID());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlanError);
    expect((caught as PlanError).status).toBe(404);
  });
});

async function insertUser(plan: Plan = "free"): Promise<string> {
  const [row] = await getDb()<{ id: string }[]>`
    INSERT INTO users (email, password_hash, plan)
    VALUES (${`setplan-${crypto.randomUUID()}@example.com`}, 'x', ${plan}) RETURNING id
  `;
  return row!.id;
}

async function auditRows(userId: string) {
  return getDb()<
    { old_plan: string; new_plan: string; changed_by: string | null; created_at: Date }[]
  >`SELECT old_plan, new_plan, changed_by, created_at FROM plan_changes WHERE user_id = ${userId}`;
}

async function dbPlan(userId: string): Promise<string> {
  const [row] = await getDb()<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${userId}`;
  return row!.plan;
}

async function expectPlanError(promise: Promise<unknown>, status: 400 | 404, message: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(PlanError);
  expect((caught as PlanError).status).toBe(status);
  expect((caught as PlanError).message).toBe(message);
}

describe("isPlan (plan_management_admin R26)", () => {
  test("accepts exactly the PLAN_LIMITS keys", () => {
    for (const plan of Object.keys(PLAN_LIMITS)) expect(isPlan(plan)).toBe(true);
    for (const bad of ["gold", "Premium", "", "toString", "__proto__", "constructor"]) {
      expect(isPlan(bad)).toBe(false);
    }
  });
});

describe("setUserPlan (plan_management_admin)", () => {
  test("free -> basic with changedBy null writes the plan and one audit row with NULL changed_by (R11, R13, R25)", async () => {
    const userId = await insertUser("free");
    const result = await setUserPlan(userId, "basic", null);

    expect(result.changed).toBe(true);
    expect(result.user).toEqual({
      id: userId,
      email: expect.any(String),
      plan: "basic",
      role: "user",
    });
    expect(await dbPlan(userId)).toBe("basic");
    const rows = await auditRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.old_plan).toBe("free");
    expect(rows[0]!.new_plan).toBe("basic");
    expect(rows[0]!.changed_by).toBeNull();
  });

  test("changedBy set to an existing user id is recorded (R13)", async () => {
    const adminId = await insertUser("premium");
    const userId = await insertUser("basic");
    await setUserPlan(userId, "premium", adminId);
    const rows = await auditRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changed_by).toBe(adminId);
  });

  test("same plan is a no-op: changed false, no audit row, updated_at untouched (R15)", async () => {
    const userId = await insertUser("basic");
    const [before] = await getDb()<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${userId}
    `;
    const result = await setUserPlan(userId, "basic", null);
    expect(result.changed).toBe(false);
    expect(result.user.plan).toBe("basic");
    expect(await auditRows(userId)).toHaveLength(0);
    const [after] = await getDb()<{ updated_at: Date }[]>`
      SELECT updated_at FROM users WHERE id = ${userId}
    `;
    expect(after!.updated_at).toEqual(before!.updated_at);
  });

  test("invalid plan -> PlanError 400, nothing written (R18, R26)", async () => {
    const userId = await insertUser("free");
    await expectPlanError(setUserPlan(userId, "gold", null), 400, "invalid plan");
    await expectPlanError(setUserPlan(userId, "toString", null), 400, "invalid plan");
    expect(await dbPlan(userId)).toBe("free");
    expect(await auditRows(userId)).toHaveLength(0);
  });

  test("invalid plan wins over an unknown user (R18)", async () => {
    await expectPlanError(setUserPlan(crypto.randomUUID(), "gold", null), 400, "invalid plan");
  });

  test("non-UUID user id -> PlanError 404 (R20)", async () => {
    await expectPlanError(setUserPlan("not-a-uuid", "basic", null), 404, "user not found");
  });

  test("unknown UUID and soft-deleted user -> PlanError 404 (R21)", async () => {
    await expectPlanError(setUserPlan(crypto.randomUUID(), "basic", null), 404, "user not found");

    const userId = await insertUser("free");
    await getDb()`UPDATE users SET deleted_at = NOW() WHERE id = ${userId}`;
    await expectPlanError(setUserPlan(userId, "basic", null), 404, "user not found");
    expect(await dbPlan(userId)).toBe("free");
    expect(await auditRows(userId)).toHaveLength(0);
  });

  test("audit insert failure rolls the plan back (R27)", async () => {
    const userId = await insertUser("free");
    let caught: unknown;
    try {
      await setUserPlan(userId, "premium", crypto.randomUUID());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(PlanError);
    expect(await dbPlan(userId)).toBe("free");
    expect(await auditRows(userId)).toHaveLength(0);
  });
});
