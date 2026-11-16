# Storefront API

The Web surface is mounted under `/api/v1/web`. It serves public-safe catalog,
availability and quote requests, plus signed-in storefront account flows.

## Security and ownership

- `ShopResolver` selects the deployment's active shop; browser headers cannot
  choose a shop.
- Public DTOs exclude internal cost, physical inventory IDs, warehouse
  locations, staff audit data, and operator notes.
- The browser never supplies authoritative price, deposit, shipping, or line
  totals. Quotes and orders resolve these on the server.
- Creating an order requires a signed-in account with a verified email. The
  account email is captured inside the booking transaction.

## Catalog and pricing

- `GET /api/v1/web/categories` lists active storefront categories.
- `GET /api/v1/web/products` and `/products/latest` return eligible products,
  variants, and primary media. Product records do not contain rental-rate
  schedules.
- `GET /api/v1/web/catalog/filters` returns eligible size/color choices.
- `GET /api/v1/web/products/:slug` returns the public product detail.
- `GET /api/v1/web/availability` checks a selected variant for a requested
  rental interval.
- `POST /api/v1/web/rental/quote` returns the authoritative quote, resolved
  from the shared cycle pricing policy.
- `GET /api/v1/web/policies` publishes storefront terms and current rental
  policy.

Rental periods use full date-time values with an explicit timezone offset. The
storefront sends Vietnam time (`+07:00`). Date-only requests are rejected.
Rental selection identifies a variant; if `productId` is also supplied, the
backend verifies it is the selected variant's parent. Duplicate variant lines
are merged before pricing and allocation.

## Orders and accounts

- `POST /api/v1/web/rental-orders` creates an order from a verified signed-in
  account. It requires an `Idempotency-Key` and revalidates eligibility,
  entitlement, and physical availability in the booking transaction.
- `/api/v1/web/account/rental-orders` provides signed-in order history and
  account-owned order details/actions.
- `/api/v1/web/auth/*` handles email registration, verification, sign-in,
  refresh, profile, and logout. Refresh credentials are HttpOnly cookies.
- `/api/v1/web/cart` and `/api/v1/web/favorites/*` are account-owned. Guest cart
  state stays in the browser and is not merged into the account cart.

## OpenAPI

Swagger UI is at `/docs/web`; JSON is at `/docs/web-json` and
`generated/openapi-web.json`. The storefront syncs generated types from the Web
contract rather than the Admin contract. See [API architecture](API_ARCHITECTURE.md).
