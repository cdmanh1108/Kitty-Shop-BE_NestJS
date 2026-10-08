# Kitty Backend — Web Sale API Reference

## 1. Purpose & Scope

The **Web Sale API** serves the public customer storefront (`kitty-web-nextjs`). It exposes only public-safe endpoints needed for storefront browsing, checking real-time availability, calculating authoritative rental quotes, booking rental orders, and looking up order statuses.

---

## 2. Security & Public Boundary

- **Public Access**: Catalog, availability, quote and guest booking/lookup do not require a storefront session. Account endpoints use the web JWT cookie and dedicated guards; `@Public()` bypasses only the staff authentication layer.
- **Shop Scope**: `ShopResolver` resolves the deployment's one persisted active shop. Browser-controlled headers and shop-code configuration cannot select a shop; downstream services continue to use the resolved internal `shopId`.
- **Isolated Read Models**: DTOs expose only customer-safe data. Internal cost prices, physical inventory item IDs, warehouse bin locations, staff audit trails, and internal operator notes are strictly excluded.
- **Authoritative Server Calculations**:
  - The frontend never dictates prices, deposits, shipping fees, or line totals.
  - Availability and duration are calculated strictly on the server using domain policy (`calculateRentalDurationDays`) and rates.

---

## 3. Web Storefront Endpoints

All endpoints are mounted under the `/web` prefix:

### 3.1 Catalog

- **`GET /api/v1/web/categories`**: Lists active categories for storefront navigation.
- **`GET /api/v1/web/products`**: Lists rentable, active products with primary thumbnail, sizes, colors, and rate options.
- **`GET /api/v1/web/products/latest`**: Returns up to 8 newest public, active, rentable products with `allowFreeAccessory=false` for the home collection. Filtering happens before the database limit, ordered by creation time descending with ID descending as a stable tie-breaker. No caller-controlled filters or pagination; the standard list response retains `{ items, meta }` with page 1 and limit 8.
- **`GET /api/v1/web/products/:slug`**: Retrieves product details, image gallery, description, available variants, and rental rates.

### 3.2 Availability & Quoting

- **`GET /api/v1/web/availability`**: Checks whether a storefront-eligible product or specific variant has rentable inventory available during `pickupDate` to `returnDate`.
- **`POST /api/v1/web/rental/quote`**: Computes authoritative rental subtotal, deposit, delivery fee, and grand total only for storefront-eligible variants.

Rental selection requires an explicit `variantId`. If a request also sends `productId`, it must be the selected variant's parent. Availability can be queried for that selected variant, and pricing is evaluated by the quote endpoint; duplicate request lines for the same variant are merged into one quantity before pricing and allocation.

### 3.3 Orders & Lookup

- **`POST /api/v1/web/rental-orders`**: Places a rental reservation from the storefront. It revalidates storefront eligibility and inventory stock inside the booking transaction, then resolves or creates the customer record, creates physical item allocations, and generates a reference order code.
- **`POST /api/v1/web/rental-orders/lookup`**: Tra cứu đơn thuê bảo mật.
  - **Security Requirement**: Requires both `orderCode` and the customer's `phone`.
  - Rejects with `404 Not Found` if either does not exist or if the phone does not match the order owner.
  - Returns masked phone (`091****678`), status, sanitized item list, and payment totals.

### 3.4 Policies

- **`GET /api/v1/web/policies`**: Returns public store terms, accepted deposit collateral types (e.g. cash, citizen ID), daily late fees, and standard delivery fees.

### 3.5 Account Cart and Favorites

- **`GET /api/v1/web/cart`**: Reads the signed-in account's separate saved cart; `{ cart: null }` means an empty account cart.
- **`PUT /api/v1/web/cart`**: Replaces that account's snapshot with optimistic version validation. Guest selections are not imported at login. Guest cart use stays local to the browser; no guest-import endpoint is exposed.
- **`GET /api/v1/web/favorites`**, **`GET /api/v1/web/favorites/summary`** and **`GET /api/v1/web/favorites/status`**: Read only the authenticated account's favorites.
- **`PUT` / `DELETE /api/v1/web/favorites/:productId`**: Change account favorites idempotently. No guest favorites or login import are supported; see [Favorites](FAVORITES.md).

Cart and Favorites derive account identity from the authenticated web principal. Cart snapshot writes and Favorite mutations also require the origin guard. Existing account data is retained.

---

## 4. Swagger Documentation & Code Generation

- **Swagger UI**: `/docs/web`
- **OpenAPI JSON**: `/docs/web-json` and `generated/openapi-web.json`
- **Client Consumer**: `kitty-web-nextjs` consumes `generated/openapi-web.json` via `npm run generate`.
