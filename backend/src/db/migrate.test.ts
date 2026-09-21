import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "./client";
import { migrate } from "./migrate";

describe("migrate", () => {
  test("running migrate twice is a no-op the second time (R2, R3, R4)", async () => {
    await migrate();
    const db = getDb();
    const before = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(before.map((r) => r.filename)).toEqual([
      "0001_init.sql",
      "0002_audit_columns.sql",
      "0003_song_files_ordering.sql",
    ]);

    await migrate(); // must not throw, must not duplicate rows
    const after = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(after).toEqual(before);
  });

  test("song_files, pedal_catalog, song_pedal_configs gain a NOT NULL updated_at defaulting to now() (R6)", async () => {
    const db = getDb();
    const rows = await db<{ table_name: string; column_default: string; is_nullable: string }[]>`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_name IN ('song_files', 'pedal_catalog', 'song_pedal_configs')
        AND column_name = 'updated_at'
    `;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.is_nullable).toBe("NO");
      expect(row.column_default).toContain("now()");
    }
  });

  test("every table gains a nullable deleted_at column with no default (R7)", async () => {
    const db = getDb();
    const rows = await db<{ table_name: string; column_default: string | null; is_nullable: string }[]>`
      SELECT table_name, column_default, is_nullable FROM information_schema.columns
      WHERE table_name IN ('users', 'songs', 'song_files', 'pedal_catalog', 'song_pedal_configs')
        AND column_name = 'deleted_at'
    `;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.is_nullable).toBe("YES");
      expect(row.column_default).toBeNull();
    }
  });

  test("song_files has a NOT NULL sort_order column defaulting to 0 (R9)", async () => {
    const db = getDb();
    const [col] = await db<{ column_default: string; is_nullable: string }[]>`
      SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_name = 'song_files' AND column_name = 'sort_order'
    `;
    expect(col.is_nullable).toBe("NO");
    expect(col.column_default).toContain("0");
  });

  test("a second active preset song_files row for the same song is rejected (R10, R11)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k1', 'a.syx', 'application/octet-stream', 10)
    `;

    // Bun.sql's tagged-template result is a `Query` thenable; bun:test's
    // `expect().rejects.toThrow()` hangs on it instead of observing the
    // rejection. Wrapping in `Promise.resolve(...)` normalizes it to a
    // native Promise so the matcher behaves.
    await expect(
      Promise.resolve(
        db`
          INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
          VALUES (${song.id}, 'preset', 'k2', 'b.syx', 'application/octet-stream', 10)
        `,
      ),
    ).rejects.toThrow();
  });

  test("soft-deleting a preset row allows inserting its replacement (R8)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    const [oldPreset] = await db<{ id: string }[]>`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k1', 'a.syx', 'application/octet-stream', 10) RETURNING id
    `;

    await db`UPDATE song_files SET deleted_at = NOW() WHERE id = ${oldPreset.id}`;

    // must NOT throw now that the only existing preset row is soft-deleted
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'preset', 'k2', 'b.syx', 'application/octet-stream', 10)
    `;

    const active = await db<{ storage_key: string }[]>`
      SELECT storage_key FROM song_files
      WHERE song_id = ${song.id} AND kind = 'preset' AND deleted_at IS NULL
    `;
    expect(active.map((r) => r.storage_key)).toEqual(["k2"]);
  });

  test("multiple ir/nam song_files rows with independent sort_order are allowed (R12, R13)", async () => {
    const db = getDb();
    const email = `test-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    const [song] = await db<{ id: string }[]>`
      INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
      VALUES (${song.id}, 'ir', 'k1', 'a.wav', 'audio/wav', 10, 0)
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
      VALUES (${song.id}, 'ir', 'k2', 'b.wav', 'audio/wav', 10, 1)
    `;

    const rows = await db<{ storage_key: string }[]>`
      SELECT storage_key FROM song_files
      WHERE song_id = ${song.id} AND kind = 'ir'
      ORDER BY sort_order ASC
    `;
    expect(rows.map((r) => r.storage_key)).toEqual(["k1", "k2"]);

    const [idx] = await db<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'song_files' AND indexname = 'idx_song_files_song_id_kind_sort_order'
    `;
    expect(idx.indexname).toBe("idx_song_files_song_id_kind_sort_order");
  });

  test("a failing migration file is not recorded as applied (R5)", async () => {
    const db = getDb();
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "migrate-test-"));
    const brokenFilename = "9999_broken.sql";
    await writeFile(path.join(tmpDir, brokenFilename), "SELECT * FROM this_table_does_not_exist;");

    await expect(migrate(tmpDir)).rejects.toThrow();

    const [row] = await db<{ filename: string }[]>`
      SELECT filename FROM schema_migrations WHERE filename = ${brokenFilename}
    `;
    expect(row).toBeUndefined();

    await rm(tmpDir, { recursive: true, force: true });
  });
});
