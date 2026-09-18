# API guide

Base prefix: `/api/v1`. Swagger UI is served at `/docs` and `npm run openapi:export` writes `generated/openapi.json` for the frontend.

## Authentication

1. `POST /auth/login`
2. Store the returned access token in memory/secure application state and send `Authorization: Bearer <token>`.
3. Use `POST /auth/refresh` to rotate the opaque refresh token.
4. `POST /auth/logout` revokes a refresh token.

For a browser app, a future BFF/httpOnly-cookie layer is preferred over localStorage refresh-token storage.

## Main endpoint groups

- `/dashboard/summary`: page-shaped, tenant-scoped real admin read model; see [Dashboard](DASHBOARD.md).
- `/customers`
- `/catalog/lookups`
- `/products` (including product media management)
- `/inventory`
- `/inventory/availability/search`
- `/rental-orders`
- `/payments`, `/rental-orders/:orderId/payments`
- `/expenses`, `/expense-categories`
- `/deliveries`
- `/reminders`
- `/reports/revenue`, `/reports/products`, `/reports/customers`
- `/settings`
- `/members`
- `/audit-logs`
- `/health/live`, `/health/ready`

## Calendar query

Use `GET /rental-orders?from=<ISO>&until=<ISO>`. The query returns orders whose rental interval overlaps the requested interval, not only orders that start inside it.

## Availability

Use `GET /inventory/availability/search?variantId=<uuid>&from=<ISO>&until=<ISO>` before presenting physical availability. Creation still revalidates and the DB exclusion constraint is authoritative.

## Creating a rental

`POST /rental-orders` accepts product variant quantities and optional physical `inventoryItemIds`. When omitted, the backend chooses available physical items.

Send an `Idempotency-Key` header for retries. The backend creates the order, historical price snapshot, physical allocations, charges, optional delivery, status history and outbox event atomically.

## FE code generation

The committed artifacts are `generated/openapi-web.json`, `generated/openapi-admin.json`, and the Admin compatibility copy `generated/openapi.json`. In this workspace:

```bash
# kitty-be
npm run openapi:export
# verifies freshness without changing any generated/openapi*.json file
npm run openapi:check
# kitty-admin-fe
npm run api:sync
npm run api:check
```

Do not hand-edit BE generated/openapi.json, FE openapi/kitty-api.json or FE src/api/generated/schema.ts. The FE uses openapi-typescript and openapi-fetch. api:check validates snapshot-to-TypeScript consistency; compare parsed BE/FE JSON or sync to verify cross-repository equality. Swagger HTTP exposure is controlled by SWAGGER_ENABLED and defaults off in production.

When a backend DTO/controller changes, run `npm run openapi:check`. If it reports a stale contract, run `npm run openapi:export`, review and commit the generated artifacts, then run the check again. `openapi:check` generates current documents in memory and compares their canonical content with the committed files; it never updates them.

## API versioning

The first stable contract is URL-prefixed as `/api/v1`. Add `/api/v2` only for breaking transport changes; business evolution should usually be backward-compatible inside v1.

OpenAPI info.title is generated from APP_NAME. Use the same APP_NAME (Kitty Shop API for the committed snapshot) when comparing complete documents; distinguish configuration metadata from endpoint/schema drift.
