# Storefront authentication

## Admin account directory

`GET /admin/web-accounts` and `GET /admin/web-accounts/:id` are read-only and require
`customers.view` through Admin authentication. Accounts include registrations without
orders. Because WebAccount is global within the single-shop deployment, the service
verifies the authenticated shop matches ShopResolver before reading accounts. Rental
counts and latest booking timestamps are scoped to that shop. The projection selects
only contact defaults, verification/disabled dates, registration date and activity;
password hashes, OTPs and session records never enter responses.

The list accepts pagination, name/email/contact-phone search, `verification` and optional
`customerId`. The customer filter uses actual RentalOrder account/customer relations,
including historical orders; it never guesses ownership from matching phone or email.
`GET /admin/rental-orders?webAccountId=...` returns the account's orders under the existing
`rentals.view` permission and authenticated shop scope, with normal server pagination.
There are no Admin profile mutations or CRM/account merges in this directory.

## Contact defaults and authenticated checkout

`PATCH /web/auth/profile` saves the current verified account's full name and contact
phone; `/me`, login and refresh return these optional nullable fields. The phone is
contact information, not a login, verification or ownership key, and multiple accounts
may use the same contact phone. The endpoint accepts only `fullName` and `phone`,
normalizes Vietnamese numbers to ten digits and audits the account actor. It does
not change email, CRM contacts, or past orders. The release baseline creates
these nullable contact defaults for a new database.
New storefront booking requires a signed-in verified email account; its email is read
and captured inside the booking transaction rather than accepted from the frontend.
Contact details can differ for each order; saving an order contact as default is an
explicit independent profile PATCH. Checkout payment preferences are cash or bank
transfer. They are not recorded payments; actual receipts remain in the rental
payment ledger.

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

Email is the required unique storefront account identity. The current database
schema has no phone-based login identity or phone verification column.
`contact_phone` is optional profile data and is not used to resolve account
ownership.

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
