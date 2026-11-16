# Catalog read models

Catalog read endpoints return bounded resource-specific projections rather than
complete Prisma records.

## Product and inventory reads

- Product lists return catalog fields, category labels, a primary image, and
  compact variant labels. They do not return rental-price ranges. Pricing is
  resolved from the rental policy during quote and booking.
- Product lookup is paginated and supports search, status, category, and exact ID
  preselection. The exact-ID path does not depend on the record being in the
  current page.
- Category reads include counts for the shop's unarchived products.
- Inventory lists select SKU, variant/product labels, location, status, and only
  the relevant active allocation summary. Detailed status history is a separate
  bounded read.
- Inventory summary uses database aggregation for operational status and active
  allocations; it is not calculated from the currently displayed page.

All shop-scoped reads derive `shopId` from the authenticated principal. Static
routes are declared before `/:id` routes. Transport DTOs validate paging and
filters before mapping to application contracts.

## Storefront catalog

Public product reads expose only active, public, rentable, unarchived products
for the resolved shop. They include a compact variant projection and primary
image. Price is returned by the quote/policy endpoints for a requested rental
period; the catalog does not imply one price is valid for every duration.

The current catalog contract supports newest and name ordering. Sorting by
catalog rental rates is not supported because products no longer own a rate
schedule.

## Query boundaries

Relation data is loaded in bounded queries and projections. Avoid per-row SQL or
HTTP requests, eager loading of full galleries/history, and browser-side totals
derived from a partial page. Add an index only after matching an active query
path and measuring its database plan.

Admin and storefront contracts are generated separately from the backend
OpenAPI documents. See [API](API.md) for the export and synchronization flow.
