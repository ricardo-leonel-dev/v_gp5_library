import type { SQL } from "bun";
import { getDb } from "../db/client";

export type Plan = "free" | "basic" | "premium";

export interface PlanLimits {
  songs: number | null;
  presetsPerSong: number | null;
}

// null = unlimited
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { songs: 1, presetsPerSong: 1 },
  basic: { songs: 2, presetsPerSong: 2 },
  premium: { songs: null, presetsPerSong: null },
};

export type PlanLimitCode = "plan_song_limit" | "plan_preset_limit";

export class PlanLimitError extends Error {
  readonly status = 402;
  constructor(
    message: string,
    public readonly code: PlanLimitCode,
    public readonly plan: Plan,
    public readonly limit: number,
  ) {
    super(message);
  }
}

export class PlanError extends Error {
  constructor(message: string, public readonly status: 404) {
    super(message);
  }
}

export interface PlanSummaryDto {
  plan: Plan;
  limits: PlanLimits;
  usage: { songs: number };
}

export async function getUserPlan(db: SQL, userId: string): Promise<Plan | null> {
  const [row] = await db<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${userId}`;
  // The users_plan_tier CHECK (migration 0005) guarantees the value is a Plan.
  return row ? (row.plan as Plan) : null;
}

export async function countLiveSongs(db: SQL, userId: string): Promise<number> {
  const [row] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM songs WHERE user_id = ${userId} AND deleted_at IS NULL
  `;
  return row!.count;
}

export function checkPlanLimits(plan: Plan, liveSongCount: number, presetCount: number): void {
  const limits = PLAN_LIMITS[plan];
  if (limits.songs !== null && liveSongCount >= limits.songs) {
    throw new PlanLimitError(
      `plan '${plan}' is limited to ${limits.songs} songs`,
      "plan_song_limit",
      plan,
      limits.songs,
    );
  }
  if (limits.presetsPerSong !== null && presetCount > limits.presetsPerSong) {
    throw new PlanLimitError(
      `plan '${plan}' is limited to ${limits.presetsPerSong} presets per song`,
      "plan_preset_limit",
      plan,
      limits.presetsPerSong,
    );
  }
}

export async function getPlanSummary(userId: string): Promise<PlanSummaryDto> {
  const db: SQL = getDb();
  const plan = await getUserPlan(db, userId);
  if (plan === null) {
    throw new PlanError("user not found", 404);
  }
  return {
    plan,
    limits: PLAN_LIMITS[plan],
    usage: { songs: await countLiveSongs(db, userId) },
  };
}
