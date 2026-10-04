import { getDb } from "../db/client";
import { isUuid } from "../db/uuid";
import { normalizeEmail } from "./email";
import { hashPassword, verifyPassword } from "./password";
import { issueToken } from "./jwt";

export type Role = "user" | "admin";

export interface PublicUser {
  id: string;
  email: string;
  plan: string;
  role: Role;
}

export type UserRow = { id: string; email: string; plan: string; role: string };

export class AuthError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 409) {
    super(message);
  }
}

export function toPublicUser(row: UserRow): PublicUser {
  // The users_role_valid CHECK (migration 0006) guarantees the value is a Role.
  return { id: row.id, email: row.email, plan: row.plan, role: row.role as Role };
}

// Bun.sql's PostgresError carries the SQLSTATE in `errno` ("23505" = unique_violation).
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { errno?: unknown }).errno === "23505";
}

export async function register(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const normalized = normalizeEmail(email);
  if (normalized === "") {
    throw new AuthError("email and password are required", 400);
  }
  const db = getDb();
  // No deleted_at filter: a soft-deleted account still owns its email.
  const existing = await db`SELECT id FROM users WHERE lower(email) = ${normalized}`;
  if (existing.length > 0) {
    throw new AuthError("Email is already registered", 409);
  }

  const passwordHash = await hashPassword(password);
  let row;
  try {
    [row] = await db`
      INSERT INTO users (email, password_hash)
      VALUES (${normalized}, ${passwordHash})
      RETURNING id, email, plan, role
    `;
  } catch (err) {
    // A concurrent register for the same email passed the check above first.
    if (isUniqueViolation(err)) {
      throw new AuthError("Email is already registered", 409);
    }
    throw err;
  }

  const user = toPublicUser(row as UserRow);
  const token = await issueToken(user.id, user.plan);
  return { token, user };
}

export async function login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const normalized = normalizeEmail(email);
  if (normalized === "") {
    throw new AuthError("email and password are required", 400);
  }
  const db = getDb();
  const [row] = await db`
    SELECT id, email, plan, role, password_hash FROM users
    WHERE lower(email) = ${normalized} AND deleted_at IS NULL
  `;
  if (!row) {
    throw new AuthError("Invalid credentials", 401);
  }

  const valid = await verifyPassword(password, row.password_hash as string);
  if (!valid) {
    throw new AuthError("Invalid credentials", 401);
  }

  const user = toPublicUser(row as UserRow);
  const token = await issueToken(user.id, user.plan);
  return { token, user };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const db = getDb();
  const [row] = await db`
    SELECT id, email, plan, role FROM users WHERE id = ${userId} AND deleted_at IS NULL
  `;
  if (!row) {
    throw new AuthError("User not found", 401);
  }
  return toPublicUser(row as UserRow);
}

export async function getUserRole(userId: string): Promise<Role | null> {
  if (!isUuid(userId)) return null;
  const [row] = await getDb()<{ role: string }[]>`
    SELECT role FROM users WHERE id = ${userId} AND deleted_at IS NULL
  `;
  return row ? (row.role as Role) : null;
}

export async function findUserByEmail(email: string): Promise<PublicUser | null> {
  const [row] = await getDb()<UserRow[]>`
    SELECT id, email, plan, role FROM users
    WHERE lower(email) = ${normalizeEmail(email)} AND deleted_at IS NULL
  `;
  return row ? toPublicUser(row) : null;
}
