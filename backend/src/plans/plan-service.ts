import type { SQL } from "bun";
import { toPublicUser, type PublicUser, type UserRow } from "../auth/user-service";
import { getDb } from "../db/client";
import { isUuid } from "../db/uuid";

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
  constructor(message: string, public readonly status: 400 | 404) {
    super(message);
  }
}

export interface PlanChangeResult {
  user: PublicUser;
  changed: boolean;
}

export function isPlan(value: string): value is Plan {
  return Object.hasOwn(PLAN_LIMITS, value);
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

// The only code that writes users.plan. The plan change and its audit row are
// one transaction; FOR UPDATE makes old_plan exact under concurrent changes.
export async function setUserPlan(
  userId: string,
  plan: string,
  changedBy: string | null,
): Promise<PlanChangeResult> {
  if (!isPlan(plan)) throw new PlanError("invalid plan", 400);
  if (!isUuid(userId)) throw new PlanError("user not found", 404);

  return getDb().begin(async (tx) => {
    const [row] = await tx<UserRow[]>`
      SELECT id, email, plan, role FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!row) throw new PlanError("user not found", 404);
    if (row.plan === plan) return { user: toPublicUser(row), changed: false };

    const [updated] = await tx<UserRow[]>`
      UPDATE users SET plan = ${plan}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, plan, role
    `;
    await tx`
      INSERT INTO plan_changes (user_id, old_plan, new_plan, changed_by)
      VALUES (${userId}, ${row.plan}, ${plan}, ${changedBy})
    `;
    return { user: toPublicUser(updated!), changed: true };
  });
}
