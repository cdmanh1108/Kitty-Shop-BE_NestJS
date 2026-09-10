# Database rules

- PostgreSQL is canonical; Prisma is not a replacement for database constraints.
- use UUID PKs, `TIMESTAMPTZ`, `NUMERIC(18,2)`.
- use `JSONB` only for genuinely flexible metadata, not to avoid modeling core relations.
- add indexes based on actual filters/joins/date windows.
- avoid PostgreSQL ENUM for frequently changing business statuses; use validated strings/check constraints.
- do not use `db push` in production.
- migration SQL is reviewed code.
- never drop/recreate the rental overlap exclusion constraint without a safe equivalent.
