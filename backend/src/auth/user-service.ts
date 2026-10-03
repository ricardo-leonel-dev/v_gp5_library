import { getDb } from "../db/client";
import { isUuid } from "../db/uuid";
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

export async function register(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const db = getDb();
  const existing = await db`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    throw new AuthError("Email is already registered", 409);
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db`
    INSERT INTO users (email, password_hash)
    VALUES (${email}, ${passwordHash})
    RETURNING id, email, plan, role
  `;

  const user = toPublicUser(row as UserRow);
  const token = await issueToken(user.id, user.plan);
  return { token, user };
}

export async function login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const db = getDb();
  const [row] = await db`SELECT id, email, plan, role, password_hash FROM users WHERE email = ${email}`;
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
  const [row] = await db`SELECT id, email, plan, role FROM users WHERE id = ${userId}`;
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
    SELECT id, email, plan, role FROM users WHERE email = ${email} AND deleted_at IS NULL
  `;
  return row ? toPublicUser(row) : null;
}
