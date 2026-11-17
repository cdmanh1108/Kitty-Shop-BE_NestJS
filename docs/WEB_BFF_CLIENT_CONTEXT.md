# Storefront authentication client identity

## Deployment and trust boundary

Supported production path: browser → domain pointing directly to Vercel → Next auth BFF → HTTPS backend → Nest.
The storefront obtains the public client IP from Vercel's `x-vercel-forwarded-for` header, only when the
server's `VERCEL=1` platform environment is present. It never falls back to browser-supplied
`x-forwarded-for` or `x-real-ip`. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).
Adding another proxy in front of Vercel requires reviewing this boundary before deployment.

Next signs a short-lived IP assertion using the independent server-only `WEB_BFF_CLIENT_CONTEXT_SECRET`.
Nest validates it before throttling and uses the verified canonical IP as the tracker. Login remains
10 requests/minute/IP, refresh 30, register/resend 5, and verify OTP 10. The handler remains part of the
throttle key. New timestamps/signatures do not create new budgets. IPv4-mapped IPv6 is normalized to IPv4.
People using one public IP (for example the same Wi-Fi) still share a budget.

All `WebAuthController` operations require a valid assertion in production, including `me`, profile and
logout. Missing/invalid assertions return 403 `WEB_CLIENT_CONTEXT_INVALID`; they cannot use an unsigned
fallback bucket. Backend startup refuses a missing/malformed/reused secret. Other direct backend APIs,
including Admin auth, retain their existing proxy and throttle policy. `TRUST_PROXY` is not widened.
The verified IP also supplies Web session IP metadata and request-scoped audit metadata.

Rate-limit storage remains the existing process-local Nest storage: restarting clears counters and
multiple backend instances do not share counters. This change does not add distributed rate limiting.

## Configuration and first rollout

1. Generate **one new random value**, separate from all JWT/OTP secrets, on a trusted machine:

   ```bash
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Add the exact same 64-hex-character value as `WEB_BFF_CLIENT_CONTEXT_SECRET` to:
   - Vercel project → Settings → Environment Variables for the storefront's production environment.
     Configure Preview too if building previews; keep the variable server-only, never `NEXT_PUBLIC_*`.
   - Backend server `.env` (the API service already uses `env_file: .env`). No Admin FE variable is needed.
3. Verify the storefront `BACKEND_BASE_URL` is HTTPS and includes the actual API prefix, for example
   `https://api.example.com/api/v1`. Keep platform system environment variables available to Vercel Functions.
   Include both the storefront and Admin HTTPS origins in backend `CORS_ORIGINS`; the auth BFF forwards
   the browser `Origin`, which the backend checks against this allowlist.
4. **Deploy the storefront first**, then deploy/recreate the backend API with the matching secret.
   The old backend ignores the new header; the new backend requires it. Deploying backend first temporarily
   rejects old unsigned storefront auth requests. Do not change the database or run a migration for this task.
5. Check login, refresh, registration/OTP, profile and logout on the deployed storefront. Verify Admin login
   separately. Do not print the secret or assertion header in proxy/application logs.

Changing Vercel environment variables requires redeploying the storefront; updating backend `.env`
requires recreating the API container. Once both sides enforce signatures, key rotation must be coordinated
on both sides during a maintenance window; there is no previous-key grace mode.

Local development/test can omit the secret and use the existing backend socket/proxy identity.
If signing is enabled locally without Vercel, Next signs the fixed `127.0.0.1` development identity,
never arbitrary incoming forwarding headers. Production has no such fallback. The isolated Web build
check supplies a public, test-only fixture key, never a deployable secret.

## Internal wire protocol

Exactly one `x-kitty-web-client-context` header is allowed:

```text
v1|<13-digit Unix milliseconds>|<canonical single IP>|<lowercase HMAC-SHA256 hex>
```

HMAC key: decoded 32-byte hex secret. UTF-8 message (no final newline):

```text
kitty-web-client.v1
<timestamp>
<canonical IP>
<uppercase HTTP method>
<actual upstream pathname and query>
```

Nest checks the exact method and `originalUrl`, constant-time MAC equality, maximum age 60 seconds and
maximum future skew 5 seconds. Server clocks must be synchronized. Comma chains, ports, IPv6 zone IDs,
duplicate headers, noncanonical IP encodings and malformed signatures are rejected. Requests must use
HTTPS to protect cookies and prevent assertion capture in transit. Redirects are rejected by the auth BFF.

This assertion identifies an IP for rate limiting; it is **not** an account credential, does not sign the
request body and cannot authorize a user. Existing passwords, OTPs, cookies, JWTs and origin checks still
apply. Replaying a valid assertion consumes the same IP budget. Next never returns the internal header to
the browser and continues forwarding only the existing allowlisted auth headers.

The protocol is implemented independently in both repositories. A fixed IPv6/HMAC test vector checks
compatibility; HTTP regressions check separate client budgets, same-IP throttling, spoofing, signature
expiry, duplicate headers, method/path/query binding and session/audit IP propagation.
