import { Hono } from "hono";
import { getDb } from "./db/client";
import { type AuthVariables } from "./middleware/require-auth";
import { protectedRouter } from "./middleware/protected-router";
import { register, login, getMe, AuthError } from "./auth/user-service";
import { createSong, listSongs, getSongById, deleteSong, getSongFile, SongError } from "./songs/song-service";
import { parseCreateSongMultipart } from "./songs/parse-multipart";

const app = new Hono<{ Variables: AuthVariables }>();

app.get("/health", async (c) => {
  try {
    await getDb()`SELECT 1`;
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 500);
  }
});

app.post("/auth/register", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return c.json({ error: "email and password are required" }, 400);

  try {
    const result = await register(email, password);
    return c.json(result, 201);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return c.json({ error: "email and password are required" }, 400);

  try {
    const result = await login(email, password);
    return c.json(result);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.post("/auth/logout", (c) => {
  // Stateless JWT: nothing to invalidate server-side, the client just
  // discards the token.
  return c.json({ message: "Logged out" });
});

protectedRouter.get("/auth/me", async (c) => {
  try {
    const user = await getMe(c.get("userId"));
    return c.json(user);
  } catch (err) {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.post("/songs", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const input = await parseCreateSongMultipart(body as Record<string, string | File | (string | File)[] | undefined>);
  try {
    const song = await createSong(c.get("userId"), input);
    return c.json(song, 201);
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/songs", async (c) => {
  return c.json(await listSongs(c.get("userId")));
});

protectedRouter.get("/songs/:id", async (c) => {
  try {
    return c.json(await getSongById(c.get("userId"), c.req.param("id")));
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.delete("/songs/:id", async (c) => {
  try {
    await deleteSong(c.get("userId"), c.req.param("id"));
    return c.body(null, 204);
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

protectedRouter.get("/songs/:id/files/:kind", async (c) => {
  try {
    const file = await getSongFile(
      c.get("userId"),
      c.req.param("id"),
      c.req.param("kind"),
      c.req.query("sort_order"),
    );
    return c.body(new Uint8Array(file.bytes), 200, {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.originalFilename}"`,
    });
  } catch (err) {
    if (err instanceof SongError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

app.route("/", protectedRouter);

export default app;
