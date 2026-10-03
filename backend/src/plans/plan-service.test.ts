import { describe, expect, test } from "bun:test";
import { getDb } from "../db/client";
import {
  PLAN_LIMITS,
  PlanError,
  PlanLimitError,
  checkPlanLimits,
  getPlanSummary,
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
