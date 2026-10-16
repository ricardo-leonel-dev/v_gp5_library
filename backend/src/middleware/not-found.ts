import type { NotFoundHandler } from "hono";

export const jsonNotFound: NotFoundHandler = (c) => c.json({ error: "Not found" }, 404);
