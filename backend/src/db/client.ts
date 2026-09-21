import { SQL } from "bun";

let client: SQL | undefined;

export function getDb(): SQL {
  client ??= new SQL(process.env.DATABASE_URL ?? "");
  return client;
}
