# GP-5 Library

A personal, multi-user library for Valeton GP-5 presets: connect to the
pedal from the browser, save presets per song (with optional IR/NAM files
and a cover image), and re-import them losslessly whenever you need them.
Each user's library is private; a shared in-app "pedal bank" catalog lets
everyone reference external pedal configs without exposing their own
settings.

## Layout

This is a monorepo with two independent projects, each with its own
harness install (`AGENTS.md`, `harness.db`, `docs/`, `CHECKPOINTS.md`) for
the `leader` → `implementer` → `reviewer` TDD workflow:

- `backend/` — TypeScript (ESM), Bun, Hono, Postgres via `Bun.sql`. See
  `backend/docs/architecture.md`.
- `frontend/` — Angular 22, Tailwind, Transloco, Three.js. Talks to the
  pedal directly from the browser via the Web MIDI API. See
  `frontend/docs/architecture.md`.

## Running locally

```bash
docker compose up -d              # local Postgres for app data

cd backend
cp .env.example .env
bun install
bun test
bun run dev                       # http://localhost:3000 (see src/index.ts)

cd ../frontend
bun install
bun run test
bun run start                     # http://localhost:4200
```

Web MIDI (the pedal connection) works in Chrome, Edge, Opera, and Firefox
108+ — not in Safari (macOS or iOS), which has no roadmap to support it.
