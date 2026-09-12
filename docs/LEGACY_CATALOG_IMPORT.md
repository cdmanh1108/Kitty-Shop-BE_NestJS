# Legacy catalog import CLI

`src/cli/legacy-catalog/` owns workbook parsing, validation, mapping and import orchestration. `scripts/import-legacy-catalog.ts` boots a dedicated LegacyCatalogImportModule with central config, Prisma and audit support. HTTP CatalogModule does not register/export the importer or load XLSX.

## Safe operation

Supply an explicit workbook path and shop code. Keep real files outside version control; `private-data/` is ignored. Examples use placeholders, not real workbook names.

```bash
# Read-only database planning; validates and reconciles counts
npm run import:legacy-catalog -- --file "/path/to/workbook.xlsx" --shop SHOP_CODE --dry-run

# MUTATES DATABASE: only after reviewing the dry-run report and a backup
npm run import:legacy-catalog -- --file "/path/to/workbook.xlsx" --shop SHOP_CODE --apply
```

`--file` is required. Dry-run is the default; explicit `--dry-run` overrides `--apply`. The target shop must already exist. This command does not start an HTTP server. XLSX remains a production dependency for deployed CLI tooling.

## Import semantics

Required sheets are Products, Categories and Settings using the exact Vietnamese names/column vocabulary in `legacy-xlsx.parser.ts`. Validation reports malformed rows, duplicate codes and ambiguous multi-color quantities. Importing one physical item with multiple color possibilities must not create a physical item per color. Ambiguous quantities stay explicitly unallocated for review.

Each Product aggregate is written in one transaction. Reruns preserve unchanged Product/Variant/Inventory identities; divergent existing Products report conflicts rather than being overwritten. DB uniqueness remains the final guard against concurrent writers. No database reset or destructive replacement is part of import.

Media rows initially retain external source URLs. The separate media sync command uploads and stores canonical storage keys; URLs are derived at read time. See [Object storage](OBJECT_STORAGE.md).

Tests generate synthetic workbooks in temporary directories, including parser, dry-run and rerun checks. No private workbook is required for the test suite. Current verification: [Stabilization report](STABILIZATION.md).
