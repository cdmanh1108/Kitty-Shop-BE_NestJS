# API conventions

- URL prefix: `/api/v1`.
- nouns/resources use kebab-case only when multiple words are needed.
- authenticated tenant comes from `@CurrentUser()`.
- mutations require explicit permissions.
- create-order retries should use `Idempotency-Key`.
- list endpoints use `page` + `limit`; date ranges use ISO `from`/`until` with end-exclusive semantics.
- do not expose raw database errors.
- do not return secrets/password hashes/token hashes.
- breaking API contract requires versioning or a coordinated migration.
- regenerate `generated/openapi.json` after contract changes.
