import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDb } from "./client";
import { migrate } from "./migrate";

async function insertSong(db: ReturnType<typeof getDb>): Promise<{ id: string }> {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const [user] = await db<{ id: string }[]>`
    INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
  `;
  const [song] = await db<{ id: string }[]>`
    INSERT INTO songs (user_id, name) VALUES (${user.id}, 'Test Song') RETURNING id
  `;
  return song;
}

describe("migrate", () => {
  test("running migrate twice is a no-op the second time (R2, R3, R4)", async () => {
    await migrate();
    const db = getDb();
    const before = await db<{ filename: string }[]>`SELECT filename FROM schema_migrations ORDER BY filename`;
    expect(before.map((r) => r.filename)).toEqual([
      "0001_init.sql",
      "0002_audit_columns.sql",
      "0003_song_files_ordering.sql",
      "0004_multiple_presets_per_song.sql",
      "0005_plan_tiers.sql",
      "0006_user_roles_and_plan_changes.sql",
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

  test("songs has no pedal_preset_name column after migration 0004 (multiple_presets_per_song R1)", async () => {
    const db = getDb();
    const rows = await db<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'songs' AND column_name = 'pedal_preset_name'
    `;
    expect(rows).toHaveLength(0);
  });

  test("song_files.pedal_preset_name is a nullable VARCHAR(255) with no default (multiple_presets_per_song R2)", async () => {
    const db = getDb();
    const [col] = await db<
      {
        data_type: string;
        character_maximum_length: number;
        is_nullable: string;
        column_default: string | null;
      }[]
    >`
      SELECT data_type, character_maximum_length, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'song_files' AND column_name = 'pedal_preset_name'
    `;
    expect(col.data_type).toBe("character varying");
    expect(col.character_maximum_length).toBe(255);
    expect(col.is_nullable).toBe("YES");
    expect(col.column_default).toBeNull();
  });

  test("re-executing the 0004 SQL on an already-migrated database does not throw (multiple_presets_per_song R3)", async () => {
    const db = getDb();
    const sql = await readFile(
      path.join(import.meta.dir, "migrations", "0004_multiple_presets_per_song.sql"),
      "utf8",
    );
    await db.unsafe(sql);
    await db.unsafe(sql);

    const [idx] = await db<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'song_files' AND indexname = 'idx_song_files_preset_sort_order'
    `;
    expect(idx.indexname).toBe("idx_song_files_preset_sort_order");
    const old = await db<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'song_files' AND indexname = 'idx_song_files_one_preset_per_song'
    `;
    expect(old).toHaveLength(0);
  });

  test("two active preset rows with different sort_order for the same song are accepted (multiple_presets_per_song R4)", async () => {
    const db = getDb();
    const song = await insertSong(db);
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order, pedal_preset_name)
      VALUES (${song.id}, 'preset', 'k1', 'a.prst', 'application/octet-stream', 10, 0, 'A')
    `;
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order, pedal_preset_name)
      VALUES (${song.id}, 'preset', 'k2', 'b.prst', 'application/octet-stream', 10, 1, 'B')
    `;

    const rows = await db<{ sort_order: number; pedal_preset_name: string }[]>`
      SELECT sort_order, pedal_preset_name FROM song_files
      WHERE song_id = ${song.id} AND kind = 'preset' AND deleted_at IS NULL
      ORDER BY sort_order ASC
    `;
    expect(rows.map((r) => [r.sort_order, r.pedal_preset_name])).toEqual([
      [0, "A"],
      [1, "B"],
    ]);
  });

  test("a second active preset row with the same sort_order is rejected (multiple_presets_per_song R5; supersedes songs_schema_migrations R10, R11)", async () => {
    const db = getDb();
    const song = await insertSong(db);
    await db`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
      VALUES (${song.id}, 'preset', 'k1', 'a.prst', 'application/octet-stream', 10, 0)
    `;

    // Bun.sql's tagged-template result is a `Query` thenable; bun:test's
    // `expect().rejects.toThrow()` hangs on it instead of observing the
    // rejection. Wrapping in `Promise.resolve(...)` normalizes it to a
    // native Promise so the matcher behaves.
    await expect(
      Promise.resolve(
        db`
          INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, sort_order)
          VALUES (${song.id}, 'preset', 'k2', 'b.prst', 'application/octet-stream', 10, 0)
        `,
      ),
    ).rejects.toThrow();
  });

  test("a non-preset row with a non-NULL pedal_preset_name is rejected on INSERT and UPDATE (multiple_presets_per_song R6)", async () => {
    const db = getDb();
    const song = await insertSong(db);

    await expect(
      Promise.resolve(
        db`
          INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size, pedal_preset_name)
          VALUES (${song.id}, 'ir', 'k1', 'a.wav', 'audio/wav', 10, 'Nope')
        `,
      ),
    ).rejects.toThrow();

    const [ir] = await db<{ id: string }[]>`
      INSERT INTO song_files (song_id, kind, storage_key, original_filename, mime_type, byte_size)
      VALUES (${song.id}, 'ir', 'k2', 'b.wav', 'audio/wav', 10) RETURNING id
    `;
    await expect(
      Promise.resolve(db`UPDATE song_files SET pedal_preset_name = 'Nope' WHERE id = ${ir.id}`),
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

  test("users.plan rejects a non-tier value and accepts free/basic/premium (plan_tiers R1)", async () => {
    const db = getDb();
    const email = `tier-${crypto.randomUUID()}@example.com`;
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash) VALUES (${email}, 'x') RETURNING id
    `;
    await expect(
      Promise.resolve(db`UPDATE users SET plan = 'gold' WHERE id = ${user!.id}`),
    ).rejects.toThrow();
    await expect(
      Promise.resolve(
        db`INSERT INTO users (email, password_hash, plan)
           VALUES (${`tier-${crypto.randomUUID()}@example.com`}, 'x', 'paid')`,
      ),
    ).rejects.toThrow();
    for (const plan of ["free", "basic", "premium"]) {
      await db`UPDATE users SET plan = ${plan} WHERE id = ${user!.id}`;
      const [row] = await db<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${user!.id}`;
      expect(row!.plan).toBe(plan);
    }
  });

  test("0005 maps legacy plan values to premium, keeps tier values and row counts, restores the CHECK (plan_tiers R2, R3, R4)", async () => {
    const db = getDb();
    const sql = await readFile(path.join(import.meta.dir, "migrations", "0005_plan_tiers.sql"), "utf8");
    const ids: Record<string, string> = {};
    for (const plan of ["free", "basic", "premium"]) {
      const [u] = await db<{ id: string }[]>`
        INSERT INTO users (email, password_hash, plan)
        VALUES (${`tier-${crypto.randomUUID()}@example.com`}, 'x', ${plan}) RETURNING id
      `;
      ids[plan] = u!.id;
    }
    const [legacy] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`tier-${crypto.randomUUID()}@example.com`}, 'x') RETURNING id
    `;

    await db`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier`;
    try {
      await db`UPDATE users SET plan = 'paid' WHERE id = ${legacy!.id}`;
      const countRows = async () => {
        const [r] = await db<{ users: number; songs: number; files: number }[]>`
          SELECT (SELECT COUNT(*)::int FROM users) AS users,
                 (SELECT COUNT(*)::int FROM songs) AS songs,
                 (SELECT COUNT(*)::int FROM song_files) AS files
        `;
        return r!;
      };
      const before = await countRows();

      await db.unsafe(sql);

      expect(await countRows()).toEqual(before);
    } finally {
      await db.unsafe(sql);
    }

    const [legacyRow] = await db<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${legacy!.id}`;
    expect(legacyRow!.plan).toBe("premium");
    for (const [plan, id] of Object.entries(ids)) {
      const [row] = await db<{ plan: string }[]>`SELECT plan FROM users WHERE id = ${id}`;
      expect(row!.plan).toBe(plan);
    }
    const [constraint] = await db<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'users_plan_tier'
    `;
    expect(constraint!.conname).toBe("users_plan_tier");
  });

  test("re-executing the 0005 SQL on an already-migrated database does not throw (plan_tiers R5)", async () => {
    const db = getDb();
    const sql = await readFile(path.join(import.meta.dir, "migrations", "0005_plan_tiers.sql"), "utf8");
    await db.unsafe(sql);
    await db.unsafe(sql);
  });

  test("a user inserted without role gets role 'user' (plan_management_admin R1)", async () => {
    const db = getDb();
    const [user] = await db<{ role: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`role-${crypto.randomUUID()}@example.com`}, 'x') RETURNING role
    `;
    expect(user!.role).toBe("user");
  });

  test("users.role rejects a non-role value and accepts user/admin (plan_management_admin R2)", async () => {
    const db = getDb();
    const [user] = await db<{ id: string }[]>`
      INSERT INTO users (email, password_hash)
      VALUES (${`role-${crypto.randomUUID()}@example.com`}, 'x') RETURNING id
    `;
    await expect(
      Promise.resolve(db`UPDATE users SET role = 'owner' WHERE id = ${user!.id}`),
    ).rejects.toThrow();
    await expect(
      Promise.resolve(
        db`INSERT INTO users (email, password_hash, role)
           VALUES (${`role-${crypto.randomUUID()}@example.com`}, 'x', 'root')`,
      ),
    ).rejects.toThrow();
    for (const role of ["admin", "user"]) {
      await db`UPDATE users SET role = ${role} WHERE id = ${user!.id}`;
      const [row] = await db<{ role: string }[]>`SELECT role FROM users WHERE id = ${user!.id}`;
      expect(row!.role).toBe(role);
    }
  });

  test("plan_changes has exactly the audit columns (plan_management_admin R3)", async () => {
    const db = getDb();
    const rows = await db<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'plan_changes' ORDER BY ordinal_position
    `;
    expect(rows.map((r) => r.column_name)).toEqual([
      "id",
      "user_id",
      "old_plan",
      "new_plan",
      "changed_by",
      "created_at",
    ]);
  });

  test("re-executing the 0006 SQL on an already-migrated database does not throw (plan_management_admin R4)", async () => {
    const db = getDb();
    const sql = await readFile(
      path.join(import.meta.dir, "migrations", "0006_user_roles_and_plan_changes.sql"),
      "utf8",
    );
    await db.unsafe(sql);
    await db.unsafe(sql);
    const [constraint] = await db<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = 'users_role_valid'
    `;
    expect(constraint!.conname).toBe("users_role_valid");
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
