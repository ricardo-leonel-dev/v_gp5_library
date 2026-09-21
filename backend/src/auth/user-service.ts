import { getDb } from "../db/client";
import { hashPassword, verifyPassword } from "./password";
import { issueToken } from "./jwt";

export interface PublicUser {
  id: string;
  email: string;
  plan: string;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 409) {
    super(message);
  }
}

function toPublicUser(row: { id: string; email: string; plan: string }): PublicUser {
  return { id: row.id, email: row.email, plan: row.plan };
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
    RETURNING id, email, plan
  `;

  const user = toPublicUser(row as { id: string; email: string; plan: string });
  const token = await issueToken(user.id, user.plan);
  return { token, user };
}

export async function login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const db = getDb();
  const [row] = await db`SELECT id, email, plan, password_hash FROM users WHERE email = ${email}`;
  if (!row) {
    throw new AuthError("Invalid credentials", 401);
  }

  const valid = await verifyPassword(password, row.password_hash as string);
  if (!valid) {
    throw new AuthError("Invalid credentials", 401);
  }

  const user = toPublicUser(row as { id: string; email: string; plan: string });
  const token = await issueToken(user.id, user.plan);
  return { token, user };
}

export async function getMe(userId: string): Promise<PublicUser> {
  const db = getDb();
  const [row] = await db`SELECT id, email, plan FROM users WHERE id = ${userId}`;
  if (!row) {
    throw new AuthError("User not found", 401);
  }
  return toPublicUser(row as { id: string; email: string; plan: string });
}
