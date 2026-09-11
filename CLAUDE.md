@AGENTS.md

This repository's canonical AI instructions are in `AGENTS.md` and `.ai/`. Treat them as project constraints, not optional style suggestions.

## Authentication invariants

- Never persist plaintext refresh tokens or log passwords, tokens, or Authorization headers.
- Refresh consumption and replacement persistence must share one transaction; concurrent reuse has one winner.
- Do not revoke a token family on an ambiguous concurrent refresh; see docs/AUTH_SECURITY.md.
- Login and refresh require their dedicated stricter limits relative to general defaults.
- Derive tenant/actor from authenticated membership; 401 is authentication failure, 403 is permission denial.

## Configuration and error handling invariants

- Application/domain must not read `process.env` directly; access configuration via typed `ConfigService`.
- Production startup must fail fast for missing or invalid critical secrets, TTLs, or configuration.
- Unknown internal errors must never expose raw messages, stacks, or causes to API clients in production.
- Prisma errors must be translated to safe domain/HTTP errors or sanitized to generic 500 responses.
- Swagger HTTP exposure is configuration-controlled and disabled by default in production.
- Never log tokens, passwords, Authorization headers, database URLs with credentials, or secret configuration.
