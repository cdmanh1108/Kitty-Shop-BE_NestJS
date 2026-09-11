@AGENTS.md

This repository's canonical AI instructions are in `AGENTS.md` and `.ai/`. Treat them as project constraints, not optional style suggestions.

## Authentication invariants

- Never persist plaintext refresh tokens or log passwords, tokens, or Authorization headers.
- Refresh consumption and replacement persistence must share one transaction; concurrent reuse has one winner.
- Do not revoke a token family on an ambiguous concurrent refresh; see docs/AUTH_SECURITY.md.
- Login and refresh require their dedicated stricter limits relative to general defaults.
- Derive tenant/actor from authenticated membership; 401 is authentication failure, 403 is permission denial.
