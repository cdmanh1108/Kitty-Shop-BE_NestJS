# Storefront favorites

Favorites are account-owned rows in `favorites`, identified by the `WebAccount` from the web JWT cookie.
They are not guest data and are never scoped by a browser-provided user or shop identifier.
Guest favorites are not stored or imported at login; every favorites operation requires an authenticated web session.

`GET /api/v1/web/favorites` returns only products that still meet the canonical storefront visibility
rules. `PUT` and `DELETE /api/v1/web/favorites/:productId` are idempotent. The database unique
constraint on `(account_id, product_id)` is the concurrency boundary for repeated adds.

The migration is additive: it keeps `Shop`, `Product.shopId`, and all existing shop relations unchanged.
Archived, private, unrentable, or inactive products can remain as historical favorite rows, but are not
returned to the storefront until they are eligible again.
