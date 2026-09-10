# API guide

Base prefix: `/api/v1`. Swagger UI is served at `/docs` and `npm run openapi:export` writes `generated/openapi.json` for the frontend.

## Authentication

1. `POST /auth/login`
2. Store the returned access token in memory/secure application state and send `Authorization: Bearer <token>`.
3. Use `POST /auth/refresh` to rotate the opaque refresh token.
4. `POST /auth/logout` revokes a refresh token.

For a browser app, a future BFF/httpOnly-cookie layer is preferred over localStorage refresh-token storage.

## Main endpoint groups

- `/dashboard/summary`
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

The portable contract is `generated/openapi.json`. Common FE choices:

```bash
npx openapi-typescript generated/openapi.json -o src/api/schema.d.ts
```

or point Orval/OpenAPI Generator at the same file. Regenerate the OpenAPI artifact in CI whenever controller/DTO contracts change.

## API versioning

The first stable contract is URL-prefixed as `/api/v1`. Add `/api/v2` only for breaking transport changes; business evolution should usually be backward-compatible inside v1.
