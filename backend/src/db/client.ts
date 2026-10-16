import { SQL } from "bun";
import { resolveDatabaseUrl } from "../config/stage";

let client: SQL | undefined;

export function getDb(): SQL {
  client ??= new SQL(resolveDatabaseUrl());
  return client;
}