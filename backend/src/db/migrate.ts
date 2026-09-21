import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "./client";

const MIGRATIONS_DIR = path.join(import.meta.dir, "migrations");

async function migrate(migrationsDir: string = MIGRATIONS_DIR): Promise<void> {
  const db = getDb();

  await db.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`applying ${file}`);
    await db.begin(async (tx) => {
      await tx.unsafe(sql);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
  }
}

if (import.meta.main) {
  await migrate();
  console.log("done");
  process.exit(0);
}

export { migrate };
