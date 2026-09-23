# Single-shop application model

Each backend deployment resolves exactly one persisted `Shop` through `ShopResolver`. The resolver reads up to two rows solely to verify the invariant:

- zero shops: fail with a clear `503` configuration/data-integrity error;
- one active shop: use its internal `shopId`;
- more than one shop, or one inactive shop: fail with a clear `503` error.

It never uses `findFirst`, a configured shop code, request headers, cookies, or query parameters to select a shop. Operators must reconcile an invalid database explicitly; the application does not delete, archive, or merge shops.

`Shop`, `ShopMember`, every `shopId` relation, and shop-scoped constraints remain part of the database and domain model. Application services continue to receive `shopId` internally. Admin login resolves the one shop before finding the member; JWTs retain `shopId` so the existing membership and RBAC checks remain authoritative.

Storefront and admin clients must not send `x-shop-code` or configure `SHOP_CODE`. A legacy header is ignored and cannot change the resolved shop.
