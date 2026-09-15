# Kitty Backend — Web Sale API Reference

## 1. Purpose & Scope

The **Web Sale API** serves the public customer storefront (`kitty-web-nextjs`). It exposes only public-safe endpoints needed for storefront browsing, checking real-time availability, calculating authoritative rental quotes, booking rental orders, and looking up order statuses.

---

## 2. Security & Public Boundary

- **Public Access**: Endpoints are decorated with `@Public()` and do not require Bearer JWT authentication.
- **Tenant Scope**: Tenant context (`shopId`) is resolved dynamically by `ShopResolver` from the `x-shop-code` request header or fallback default shop.
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
- **`GET /api/v1/web/products/:slug`**: Retrieves product details, image gallery, description, available variants, and rental rates.

### 3.2 Availability & Quoting
- **`GET /api/v1/web/availability`**: Checks whether a product or specific variant has rentable inventory available during `pickupDate` to `returnDate`.
- **`POST /api/v1/web/rental/quote`**: Computes authoritative rental subtotal, deposit, delivery fee, and grand total.

### 3.3 Orders & Lookup
- **`POST /api/v1/web/rental-orders`**: Places a rental reservation from the storefront. Re-validates inventory stock, resolves or creates the customer record, creates physical item allocations, and generates a reference order code.
- **`POST /api/v1/web/rental-orders/lookup`**: Tra cứu đơn thuê bảo mật.
  - **Security Requirement**: Requires both `orderCode` and the customer's `phone`.
  - Rejects with `404 Not Found` if either does not exist or if the phone does not match the order owner.
  - Returns masked phone (`091****678`), status, sanitized item list, and payment totals.

### 3.4 Policies
- **`GET /api/v1/web/policies`**: Returns public store terms, accepted deposit collateral types (e.g. cash, citizen ID), daily late fees, and standard delivery fees.

---

## 4. Swagger Documentation & Code Generation

- **Swagger UI**: `/docs/web`
- **OpenAPI JSON**: `/docs/web-json` and `generated/openapi-web.json`
- **Client Consumer**: `kitty-web-nextjs` consumes `generated/openapi-web.json` via `npm run generate`.
