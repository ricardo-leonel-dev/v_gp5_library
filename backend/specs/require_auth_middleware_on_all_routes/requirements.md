# Requirements — require_auth_middleware_on_all_routes

Scope note: at the time this spec is written, no song/pedal routes exist yet (they land in
`song_crud_api`, `pedal_catalog_api`, `song_pedal_configs_api`, `song_file_export_import`). This
feature cannot audit routes that don't exist yet, so it instead builds the structural mechanism
that makes "forgot to add `requireAuth`" impossible for every route added from now on, and proves
that mechanism (plus the existing `/auth/*` routes that already depend on it) with concrete tests.
Every future feature that adds an authenticated route MUST register it on the `protectedRouter`
introduced here (see `design.md`) rather than on the base `app` with an ad-hoc `requireAuth` arg.

## R1
The system SHALL apply the `requireAuth` middleware to every route registered on the protected
router, without requiring each individual route registration to pass `requireAuth` explicitly.

## R2
WHEN a request is made to a route mounted on the protected router without an `Authorization`
header, the system SHALL respond with HTTP 401.

## R3
WHEN a request is made to a route mounted on the protected router with an `Authorization` header
that does not start with `Bearer `, the system SHALL respond with HTTP 401.

## R4
WHEN a request is made to a route mounted on the protected router with an expired JWT bearer
token, the system SHALL respond with HTTP 401.

## R5
WHEN a request is made to a route mounted on the protected router with a JWT bearer token whose
signature fails verification, the system SHALL respond with HTTP 401.

## R6
WHEN a request is made to a route mounted on the protected router with a valid, non-expired JWT
bearer token, the system SHALL invoke the route handler with `c.get('userId')` set to that token's
subject claim.

## R7
WHERE a caller of `issueToken` passes an explicit `expiresIn` argument, the system SHALL sign the
token using that value instead of the `JWT_EXPIRES_IN` environment variable / default.

## R8
The system SHALL serve `/auth/logout` and `/auth/me` from the protected router instead of via an
inline `requireAuth` argument on the base app.

## R9
The system SHALL keep `/health`, `/auth/register`, and `/auth/login` reachable without an
`Authorization` header.

## R10
IF a request to `/auth/me` includes a `userId` value in its query string THEN the system SHALL
ignore that value and SHALL return the profile of the user identified by `c.get('userId')`.
