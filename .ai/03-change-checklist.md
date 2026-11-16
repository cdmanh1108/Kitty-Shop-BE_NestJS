# Change checklist

Before coding:

- identify owning module and invariant.
- decide whether the change affects DB, API contract, authorization or report semantics.

During coding:

- add/modify DTO validation and Swagger metadata.
- keep controller thin.
- update domain port before infrastructure adapter when new persistence capability is required.
- keep shop scope on every repository lookup.
- use a transaction for multi-row consistency.
- audit sensitive business mutations.

For DB changes:

- update `prisma/schema.prisma`.
- inspect the initial-release SQL baseline when changing database structure or invariants.
- preserve PostgreSQL-specific overlap/index constraints.
- keep the full migration chain aligned with `prisma/schema.prisma`; the initial baseline targets a new, empty database only. Never edit an applied baseline; add a migration for deployed databases.

Before finishing:

```bash
npm run format
npm run quality
npm run openapi:export
```

Update `docs/` and `.ai/02-domain-invariants.md` if behavior/invariants changed.
