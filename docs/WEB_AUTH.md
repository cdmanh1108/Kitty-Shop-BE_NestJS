# Storefront authentication

The storefront account lifecycle is `register -> verify phone -> login`. Registration
never creates a session. Staff Admin authentication remains the existing JWT/refresh-token
flow and shares neither identities nor route contracts with Web Auth.

Phones are normalized server-side to Vietnamese E.164 (`+84...`) before every lookup.
Passwords use bcrypt cost 12 and accept 8–64 characters, bounded to bcrypt's 72-byte input.
Unknown-phone and wrong-password login failures both return `INVALID_CREDENTIALS`; an
unverified state is returned only after the submitted password is proven.

OTP code generation and delivery depend on `OtpProvider`. The current configured adapter
supports a fixed code only when `AUTH_OTP_BYPASS_ENABLED=true`. Production startup rejects
that setting. With bypass disabled, the placeholder adapter returns
`OTP_DELIVERY_UNAVAILABLE`; the pending account remains recoverable through resend after a
real SMS adapter is installed. Codes are never returned by HTTP or stored directly.

Web access uses a short-lived HS256 JWT with `iss=kitty-api`, `aud=kitty-web` and
`surface=web`. Its signing key differs from Admin Auth. A 384-bit opaque refresh token is
rotated atomically; only its SHA-256 hash is persisted. Both values use HttpOnly,
SameSite=Lax cookies. `/me` verifies the access JWT then reloads the account so disabling an
account takes effect immediately. Logout revokes the refresh row and clears both cookies,
even when access has expired. Production cookie names use `__Secure-` and require HTTPS.

Public auth handlers retain route-level throttles. OTP state itself is PostgreSQL-backed,
so expiry, attempts and resend cooldown work across application instances. Throttler storage
is still process-local as documented for Admin auth. When Next.js proxies Auth, production
must preserve a trustworthy client address at the NestJS ingress or use shared throttler
storage to avoid treating all storefront clients as one address.
