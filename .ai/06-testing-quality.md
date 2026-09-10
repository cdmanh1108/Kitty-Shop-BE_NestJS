# Testing and quality gates

Minimum local/CI gate:

```bash
npm run lint
npm run test
npm run build
npm run openapi:export
```

Prefer unit tests for application state/transition rules and integration tests for PostgreSQL-specific behavior such as exclusion constraints and transaction races.

When a bug involves money, booking overlap, tenant scope or authorization, add a regression test before/with the fix.
