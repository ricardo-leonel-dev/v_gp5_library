import { toPublicUser, type PublicUser, type Role } from "../auth/user-service";
import { getDb } from "../db/client";

const USAGE = "usage: bun run set-role <email> <user|admin>";

export function parseSetRoleArgs(argv: string[]): { email: string; role: Role } | null {
  if (argv.length !== 2) return null;
  const [email, role] = argv as [string, string];
  if (email.length === 0) return null;
  if (role !== "user" && role !== "admin") return null;
  return { email, role };
}

// The only code that writes users.role. CLI entry point, never imported by src/index.ts.
export async function setUserRoleByEmail(email: string, role: Role): Promise<PublicUser | null> {
  const [row] = await getDb()<{ id: string; email: string; plan: string; role: string }[]>`
    UPDATE users SET role = ${role}, updated_at = NOW()
    WHERE email = ${email} AND deleted_at IS NULL
    RETURNING id, email, plan, role
  `;
  return row ? toPublicUser(row) : null;
}

export async function runSetRole(
  argv: string[],
  out: Pick<Console, "log" | "error"> = console,
): Promise<number> {
  const args = parseSetRoleArgs(argv);
  if (!args) {
    out.error(USAGE);
    return 1;
  }
  const user = await setUserRoleByEmail(args.email, args.role);
  if (!user) {
    out.error(`no live user with email ${args.email}`);
    return 1;
  }
  out.log(`role of ${args.email} set to ${args.role}`);
  return 0;
}

if (import.meta.main) {
  process.exit(await runSetRole(Bun.argv.slice(2)));
}
