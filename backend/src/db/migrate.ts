import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "./client";

const MIGRATIONS_DIR = path.join(import.meta.dir, "migrations");

async function migrate(): Promise<void> {
  const db = getDb();
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    console.log(`applying ${file}`);
    await db.unsafe(sql);
  }
}

if (import.meta.main) {
  await migrate();
  console.log("done");
  process.exit(0);
}

export { migrate };
