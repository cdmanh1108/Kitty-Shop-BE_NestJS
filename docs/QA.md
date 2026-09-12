# Quality gates

Before merge/release, run:

```bash
npm run format:check
npm run lint
npm run test
npm run build
npm run openapi:export
```

For database/concurrency changes use only a disposable test database:

```bash
npm run db:generate
# Supply TEST_DATABASE_URL naming a dedicated test database first
npm run test:db:migrate
npm run test:integration
npm run test:e2e
```

The existing GitHub Actions workflow is manual-only (workflow_dispatch). It runs install, Prisma generation, migration/seed and quality; it does not currently execute integration/E2E. Those gates must be run explicitly before merging relevant changes. No CI behavior was changed by this stabilization.

## Test database & test suites

See [TESTING.md](TESTING.md) for suite boundaries, explicit TEST_DATABASE_URL, guarded migration/reset, fixtures and PostgreSQL setup. `npm test` is database-free; run `npm run test:all` or the integration/E2E scripts to verify database guarantees.

## Invariants that require regression tests

- booking intervals cannot overlap for the same physical inventory item while allocation status is HELD/CONFIRMED/ACTIVE;
- deposits do not count as rental revenue;
- refresh tokens are one-time consumable during rotation;
- order status changes are compare-and-update safe under concurrency;
- all tenant-facing lookups are scoped by authenticated `shopId`;
- completed financial history is voided/reversed instead of silently deleted.
