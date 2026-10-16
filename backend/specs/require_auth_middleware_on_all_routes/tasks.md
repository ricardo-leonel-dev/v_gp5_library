# Tasks — require_auth_middleware_on_all_routes

- [x] T1 (R7) Add an optional `expiresIn` third parameter to `issueToken` in `src/auth/jwt.ts`,
      defaulting to the current `process.env.JWT_EXPIRES_IN ?? "7d"` behavior when omitted.
- [x] T2 (R1) Add `src/middleware/protected-router.ts` exporting `createProtectedRouter()` (a
      `Hono<{ Variables: AuthVariables }>` with `requireAuth` applied via `.use("*", requireAuth)`)
      and a shared `protectedRouter` instance built from it.
- [x] T3 (R8, R9) Update `src/index.ts`: mount `protectedRouter` via `app.route("/", protectedRouter)`,
      move `/auth/logout` and `/auth/me` onto `protectedRouter` (dropping their inline `requireAuth`
      argument), and leave `/health`, `/auth/register`, `/auth/login` registered on `app` unchanged.
- [x] T4 (R1, R2, R3, R4, R5, R6) Add `src/middleware/protected-router.test.ts`: build a throwaway
      `createProtectedRouter()` instance with a dummy route, and assert 401 for missing header,
      non-`Bearer` header, expired token, and tampered-signature token, and assert 200 + correct
      `c.get('userId')` propagation for a valid token.
- [x] T5 (R4, R5) Add regression tests to `src/auth/auth.test.ts`: an expired-token request and a
      tampered-token request to the real `/auth/me` both return 401.
- [x] T6 (R10) Add a test to `src/auth/auth.test.ts`: a valid token for user A requesting
      `GET /auth/me?userId=<some-other-uuid>` returns 200 with user A's own email, proving the
      spoofed query-string `userId` was ignored.
