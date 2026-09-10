# Change checklist

Before coding:

- identify owning module and invariant.
- decide whether the change affects DB, API contract, authorization or report semantics.

During coding:

- add/modify DTO validation and Swagger metadata.
- keep controller thin.
- update domain port before infrastructure adapter when new persistence capability is required.
- keep tenant scope on every repository lookup.
- use a transaction for multi-row consistency.
- audit sensitive business mutations.

For DB changes:

- update `prisma/schema.prisma`.
- create/inspect migration.
- preserve PostgreSQL-specific overlap/index constraints.
- make deploy migration backward-compatible where possible.

Before finishing:

```bash
npm run format
npm run quality
npm run openapi:export
```

Update `docs/` and `.ai/02-domain-invariants.md` if behavior/invariants changed.
