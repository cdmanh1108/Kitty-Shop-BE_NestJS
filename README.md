# Rental Shop Backend

Production-oriented NestJS API for a clothing rental shop admin platform. The codebase is designed for the current admin workflow and leaves stable extension points for a public catalog, customer self-booking, online payments and multiple locations later.

## Stack

- Node.js 22+
- NestJS 11
- PostgreSQL 17
- Prisma ORM 6
- Swagger / OpenAPI
- JWT access token + rotating opaque refresh token
- RBAC permissions
- Jest + ESLint + Prettier
- Docker Compose for local PostgreSQL

## Quick start

Requirements: Node.js 22+, npm 10+, and Docker Desktop/Engine if you want the automatic local database.

```bash
npm run i
npm run bootstrap
npm run start:dev
```

`npm run i` only installs dependencies.

`npm run bootstrap` creates `.env` from `.env.example` when absent, generates a random local JWT secret, starts PostgreSQL with Docker when `DB_AUTO_START=true`, applies migrations, seeds RBAC/lookups/admin, and exports OpenAPI.

If you use an existing PostgreSQL instance, install dependencies, copy `.env.example` to `.env`, edit `DATABASE_URL`, set `DB_AUTO_START=false`, then run `npm run bootstrap`.

Default local login after seed:

```text
email:    admin@example.com
password: ChangeMe123!
```

Change it before any real deployment.

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI file: `generated/openapi.json`
- Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`

## Core domain invariants

1. `Product != ProductVariant != InventoryItem`.
2. Orders snapshot product names and prices; old orders never depend on current catalog prices.
3. Physical availability is controlled by `RentalItemAllocation`, not only `inventory_items.current_status`.
4. PostgreSQL exclusion constraint is the last line of defense against overlapping active allocations.
5. `PaymentTransaction != RentalOrder`; one order can have many money movements.
6. Deposits are held money and are excluded from realized revenue.
7. Financial records and completed/cancelled orders are voided/statused rather than hard-deleted.
8. All tenant-facing repository queries are scoped by `shopId` derived from authenticated membership.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATABASE.md](docs/DATABASE.md) before changing these areas.

## Commands

```bash
npm run i                 # install dependencies only
npm run bootstrap         # prepare env, database, seed and OpenAPI
npm run start:dev         # watch mode
npm run quality           # lint + tests + production build
npm run db:up             # start local PostgreSQL only
npm run db:migrate        # apply committed migrations
npm run db:migrate:dev    # create a migration during development
npm run db:seed           # idempotent base seed
npm run db:studio         # Prisma Studio
npm run openapi:export    # regenerate generated/openapi.json
npm run import:legacy-catalog -- [options] # import legacy Excel catalog (see docs/LEGACY_CATALOG_IMPORT.md)
```

## Project structure

```text
src/
  common/                  # cross-cutting decorators, guards, filters, DTOs, utils
  config/                  # typed application configuration + env validation
  database/prisma/         # database adapter
  modules/
    <feature>/
      api/                 # controllers + transport DTOs
      application/         # use cases / orchestration
      domain/              # ports and business-facing contracts
      infrastructure/      # Prisma/external adapters
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/                      # architecture, DB, API and operations documentation
.ai/                       # AI coding rules and maintenance checklists
generated/                 # exported OpenAPI artifacts
scripts/                   # bootstrap and OpenAPI export
```

## Current admin modules

Auth/RBAC, dashboard, customers, product catalog, physical inventory, rental orders/calendar, rental overlap protection, payments/deposits, expenses, delivery/return jobs, reminders, reports, settings, members and audit log.

See [docs/API.md](docs/API.md) for endpoint groups and [docs/ROADMAP.md](docs/ROADMAP.md) for intentionally deferred features.
