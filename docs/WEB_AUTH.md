# Storefront authentication

The storefront account lifecycle is `register by email -> verify email -> sign in`. Registration
does not create a session. Email identity is trimmed and lowercased before lookup or persistence;
the API does not apply provider-specific alias rules. Admin authentication remains separate.
Passwords keep the existing bcrypt cost 12 policy: 8–64 characters, bounded to bcrypt's 72-byte
input. Unknown-email and wrong-password login failures both return `INVALID_CREDENTIALS`; an
unverified state is returned only after the submitted password is proven.

The verification challenge lifecycle is shared by registration retries and `resend-otp`. Resend
accepts only the active `challengeId`; the repository resolves the destination from the associated
account. Codes are hashed before persistence, attempts and cooldowns are enforced from stored
state, and the code is never returned by HTTP.

At the application layer, `WebRegistrationService` owns registration, verification, and resend,
including challenge generation and delivery. `WebSessionService` owns login, refresh, logout, and
access-token account resolution. Both services share the `WebAuthRepository` persistence port.

`VerificationCodeSender` is the delivery port and `ResendVerificationCodeSender` is the
infrastructure adapter used in development and production. `RESEND_API_KEY`,
`EMAIL_FROM_ADDRESS`, and `EMAIL_FROM_NAME` are required at startup outside automated tests.
Verify the sender domain in Resend and publish its required DNS records before enabling real
delivery.
The Resend request runs after challenge persistence commits; a challenge becomes verifiable only
after provider acceptance is persisted. Provider failure returns `VERIFICATION_DELIVERY_FAILED`
and marks the active challenge failed with a short retry deadline. Its code cannot verify, the
previous code remains consumed, and registration retry or a resend using the previous challenge ID
can issue one replacement after that deadline. Normal successful deliveries keep the configured
resend cooldown. `VerificationCodeGenerator` uses the configured test code only in bypass mode and
cryptographic randomness otherwise. Production startup rejects the bypass setting.

The email migration retains existing account IDs and their order, cart, favorite, audit, and
refresh-token relations. Existing phone-only accounts have no safe email source, so their legacy
phone columns remain nullable/unique and are not used by new Web Auth flows. Pending old phone
challenges are invalidated. A legacy account can continue an already-issued session, but cannot
sign in again until a future account email recovery/claim flow is implemented; its associated
orders remain tied to the retained account ID.

Web access uses a short-lived HS256 JWT with `iss=kitty-api`, `aud=kitty-web` and `surface=web`.
Its signing key differs from Admin Auth. A 384-bit opaque refresh token is rotated atomically; only
its SHA-256 hash is persisted. Both values use HttpOnly, SameSite=Lax cookies. `/me` reloads the
account so disabling an account takes effect immediately. Logout revokes the refresh row and clears
both cookies, even when access has expired. Production cookie names use `__Secure-` and require HTTPS.

Public auth handlers retain route-level throttles. OTP state is PostgreSQL-backed, so expiry,
attempts, and resend cooldown work across application instances. Throttler storage is still
process-local as documented for Admin auth. When Next.js proxies Auth, production must preserve a
trustworthy client address at the NestJS ingress or use shared throttler storage to avoid treating
all storefront clients as one address.
