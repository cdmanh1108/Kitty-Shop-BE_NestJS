# API architecture

The backend serves two clients from separate HTTP and OpenAPI surfaces:

| Client | Surface | Authentication |
| --- | --- | --- |
| `kitty-admin-fe` | `/api/v1/admin/*` | Staff JWT and RBAC permissions |
| `kitty-web-nextjs` | `/api/v1/web/*` | Public-safe reads and storefront account cookies |

Both surfaces use the same application and domain services for catalog,
availability, pricing, booking, and order lifecycle rules. Controllers own
transport DTOs and map them to application contracts. Prisma is used only in
infrastructure adapters.

The active deployment has one resolved shop. Browser headers and client
configuration cannot choose it; protected operations and shop-scoped queries use
the server-resolved `shopId`.

## Contract generation

The backend exports separate audience documents:

- Admin: `generated/openapi-admin.json`
- Storefront: `generated/openapi-web.json`

Export both with `npm run openapi:export`. The Admin frontend syncs the Admin
snapshot with `npm run api:sync`; the storefront regenerates from the Web
snapshot with `npm run generate`. Run each frontend's API check after syncing.
Generated snapshots and TypeScript files are not edited by hand.

## Release behavior

Catalog responses do not publish product rental-rate schedules. Quotes and
bookings resolve rental price from the shared cycle policy and persist a
versioned order-item snapshot. Rental APIs require complete timestamps with a
timezone offset. See [API](API.md), [Web API](WEB_API.md), and
[Business types](BUSINESS_TYPES.md) for their current contracts.
