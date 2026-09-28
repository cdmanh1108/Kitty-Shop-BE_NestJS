# Authentication and API security

## Audit and retained architecture

The backend uses email/password login (email lowercased in persistence), the deployment's
single persisted shop for membership verification, HS256 access JWTs, and opaque refresh tokens
held in an HttpOnly admin cookie. Password creation/change uses bcrypt cost 12. JWT_ACCESS_SECRET
is supplied by environment and validated as a non-placeholder secret of at least
32 characters. Length validation does not establish entropy; provision a random secret.
There is no issuer/audience convention in this API; none was introduced.

Before hardening, JWT algorithm selection was implicit and verified claims had no
runtime shape validation. Refresh consumption was conditional and atomic, but
replacement insertion happened in a separate transaction. Logout matched only a
presented hash. Login/refresh inherited the general throttle. These are now hardened.

## Access and refresh flow

- Login validates the existing generic credential error (401 for missing account,
  wrong password or inactive user/member), then signs access JWT, persists only
  the refresh hash, and sets the raw refresh token in the admin HttpOnly cookie. Login
  and refresh responses never expose that raw token in JSON. No custom timing delay or
  account lockout was added.
- JWT signing and verification explicitly constrain HS256. The guard requires UUID
  sub/mid/sid and integer iat/exp with exp > iat after signature/expiry verification.
  Permissions and personal data are not placed in JWTs.
- Access defaults to 900 seconds. JWT_ACCESS_TTL_SECONDS must be an integer 1..86400.
  Refresh defaults to 30 days. REFRESH_TOKEN_TTL_DAYS must be an integer 1..365.
  Invalid/empty/zero/fractional/overflow configuration fails startup rather than
  silently falling back. Existing default lifetimes remain unchanged.
- Refresh generation uses crypto.randomBytes(48), base64url (64 characters, 384 bits).
  Only SHA-256 hex is stored in the refresh-token tables. Each login creates a refresh
  family; token rows retain family ID, parent ID, expiry, consumption/revocation state,
  IP, user agent and creation time.
- Rotation locks the presented row in a Serializable transaction, marks it `ROTATED`,
  and inserts one replacement in the same family. A serialization loser returns 401
  without inserting a replacement or compromising the family. Insertion failure rolls
  back consumption.
- The replacement gets a fresh sliding refresh TTL; no absolute session age was added.
  Login/refresh success responses carry Cache-Control: no-store.
- The admin refresh cookie is named `__Secure-kitty_admin_refresh` in production and
  `kitty_admin_refresh` outside production. It is HttpOnly, Secure in production,
  `SameSite=Lax`, and scoped to `/<API_PREFIX>/admin/auth`. This supports the deployed
  same-site admin/API topology. A genuinely cross-site future deployment requires a
  dedicated cookie/CSRF review; `SameSite=None` is not enabled by default.
- Access JWTs cannot satisfy opaque refresh hash lookup; refresh strings cannot pass
  JWT signature verification. No additional token-type claim is needed.

## Reuse and logout guarantees

Reuse of a non-expired token consumed by rotation marks its family `REUSE_DETECTED`,
records `reuse_detected_at`, and revokes its active replacement/descendants. Logout,
password change, expiry and legacy invalidation use distinct revocation reasons and do
not create a reuse event. A genuinely concurrent request can produce a Serializable
conflict; it is rejected without revoking the winning family. No replay grace period is
used. See [Refresh-token families](REFRESH_TOKEN_FAMILIES.md).

Logout requires valid access authentication and idempotently revokes the refresh cookie's
hash only if it belongs to that principal's user AND membership. Other tokens
are unaffected; unknown or already revoked tokens still yield the existing success
response. Logout of an old, already rotated token does not revoke its replacement.
A concurrent rotation that wins before logout may therefore retain refresh capability.
The browser submits its latest cookie automatically; this API does not promise family logout.

Existing access JWTs remain usable until expiry after logout/password change, subject
to live membership/user status checks. There is no denylist. Password change retains
its existing transaction updating the hash and revoking user-wide active refresh rows;
there is no logout-all endpoint. Concurrent login/password-change session issuance is
not serialized with a user/session version and is not a new guarantee of this task.

If signing or transport fails after a committed rotation, the old token is consumed
and the client may need to log in again. There is no token replay cache; never persist
plaintext replacements to make retries work.

## Rate limiting and deployment

The existing global ThrottlerGuard runs first, then JwtAuthGuard, then PermissionsGuard.
General APIs retain RATE_LIMIT_LIMIT / RATE_LIMIT_TTL_MS (defaults 300 / 60000 ms).
Login overrides the default bucket to 10 requests / 60000 ms / IP; refresh overrides
it to 60 / 60000 ms / IP. These starting limits allow manual admin login retries and
more frequent token renewal while reducing the general default budget. Successful
requests also count. Auth overrides are fixed policies independent of general env
settings, and do not lower limits on health or ordinary protected routes.

The existing throttler keys by request.ip plus controller/handler and returns 429.
Storage remains per process/in memory, not distributed; restarts clear counters.
No account-keyed lockout was added. Large shared-NAT deployments may need tuning.
TRUST_PROXY=false is the default. Enabling it trusts one proxy hop; deployment must
ensure the app cannot be reached by a shorter/untrusted path and the proxy handles
forwarded headers correctly. Application code does not parse X-Forwarded-For itself.

## Tenant, permissions and public inventory

The global JWT guard is default-deny, with existing method-over-class Public metadata.
It resolves the single shop, reloads the membership/user and permissions, and matches JWT sub/mid/sid against DB.
Inactive users/members fail 401; permission failures remain 403. Authenticated tenant
and actor come from CurrentUser. DTO validation rejects unknown fields, so callers
cannot inject shopId/userId/permissions into login or override authenticated scope.
Business controllers retain their existing tenant-aware services/repository filters.
The canonical resolver requires that exactly one persisted shop exists and that it is active;
zero, multiple, or inactive shops fail safely before authentication can use their context.

Intentionally public controller endpoints (under configurable API_PREFIX, default api/v1):

- POST /admin/auth/login
- POST /admin/auth/refresh
- GET /health/live
- GET /health/ready

Login, refresh, and logout require a trusted Origin from `CORS_ORIGINS` and reject absent,
untrusted, or browser-declared cross-site Origins before setting, rotating, or revoking
cookie state. This is CSRF protection for cookie-authenticated endpoints; CORS only controls browser
response visibility and is not treated as CSRF protection. `CORS_ORIGINS` must list exact
trusted admin origins and is never a wildcard when credentials are enabled.

Swagger UI /docs and its document routes are separately mounted when SWAGGER_ENABLED;
they are not controller routes protected by APP_GUARD. Swagger production policy is
unchanged. Helmet, explicit configured CORS origins (empty disables CORS), and global
whitelist/forbidNonWhitelisted validation are retained. CORS is not authentication.

## Secrets and seed

Auth responses explicitly map user fields and never serialize passwordHash, tokenHash
or internal refresh rows. Member responses select safe user fields. Existing request
logging emits route templates/status/correlation, not request bodies or Authorization.
ApplicationLogger redacts credential keys/errors; existing auth outcome logging is
reused without a DB audit write for every failed login. No raw token/hash logging added.
The seed now refuses missing/default production admin passwords before DB writes and
uses ApplicationLogger for errors so Prisma errors cannot dump credential arguments.
No seed or database mutation is run by these auth tests.

## Compatibility and validation

The admin login request remains email/password, but refresh/logout no longer accept a
refresh token JSON body and login/refresh responses no longer contain one. POST auth
handlers return 201 and OpenAPI documents that status accurately. No Prisma schema or
migration change is required: refresh rows still retain only token hashes. Existing HS256
access tokens with normal generated claims remain valid. Deliberate security
changes reject malformed/other-algorithm JWTs, invalid TTL config, cross-member logout
revocation, and excessive authentication requests.

Tests: auth-security.spec.ts exercises HTTP routing, validation, real bcrypt/JWT,
global guard order, 401/403, tenant spoofing, public health, distinct token types,
throttling, cookie issuance, Origin rejection, refresh concurrency and logout with an
in-memory repository. The
Prisma adapter tests exercise conditional consume and transactional call ordering,
including insertion failure propagation. They mock delegates: they are NOT a proof
of PostgreSQL locking or rollback. PostgreSQL integration and E2E suites now additionally
verify actual rotation concurrency, rollback, expiry and logout against a dedicated test
database. See [TESTING.md](TESTING.md); no development DB is repurposed for destructive tests.
