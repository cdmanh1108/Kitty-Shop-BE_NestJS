# Quality gates

Before merge/release, run:

```bash
npm run format:check
npm run lint
npm run test
npm run build
npm run openapi:export
```

For DB changes also run against a disposable PostgreSQL database:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The repository includes a GitHub Actions workflow that provisions PostgreSQL 17 and executes these gates.

## Invariants that require regression tests

- booking intervals cannot overlap for the same physical inventory item while allocation status is HELD/CONFIRMED/ACTIVE;
- deposits do not count as rental revenue;
- refresh tokens are one-time consumable during rotation;
- order status changes are compare-and-update safe under concurrency;
- all tenant-facing lookups are scoped by authenticated `shopId`;
- completed financial history is voided/reversed instead of silently deleted.
