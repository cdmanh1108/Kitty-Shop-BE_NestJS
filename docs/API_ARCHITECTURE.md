# Kitty Backend — API Architecture & Surface Separation

## 1. Overview & Architectural Principle

`kitty-be` serves two distinct consumers:

1. **Admin Portal (`kitty-admin-fe`)**: Internal management for staff, store operations, warehouse inventory, finance, settlements, and reporting.
2. **Web Storefront (`kitty-web-nextjs`)**: Public customer-facing rental catalogue, availability checking, instant quoting, web bookings, and order lookup.

### Fundamental Rule: Shared Business Logic, Separate API Surfaces

`GET /web/catalog/filters?category=...` returns active size/color choices used by eligible public product variants in the resolved shop. It is independent of product pagination and accepts the same category code/slug/id as the product list. Sizes retain their configured ordering; colors include nullable `hexColor` for swatches. Selection names are submitted through the existing `size` and `color` product filters (up to 100 characters). An unknown category returns empty choices. This is a public read model; it does not expose staff lookup data, storage locations, inventory occupancy or quantities.

> **Admin API and Web Sale API share Domain/Application business logic but have separate API contracts, DTOs and OpenAPI documents.**

We **NEVER** duplicate domain or application business logic (no duplicate availability algorithms, pricing engines, deposit calculation, or inventory allocation).

```text
                    ┌─────────────────────────────────────────┐
                    │                 DOMAIN                  │
                    │                                         │
                    │ Rental Policy & Lifecycle               │
                    │ Inventory Status & Availability Logic   │
                    │ Rental Rates & Pricing Calculations     │
                    │ Customer Phone Normalization & Rules    │
                    │ Finance & Settlements                   │
                    └────────────────────┬────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │               APPLICATION               │
                    │                                         │
                    │ Rental Read/Creation/Lifecycle          │
                    │ Rental Return/Confirmation/Settlement   │
                    │ Web Evaluation/Order/Lookup             │
                    │ Catalog Queries, Inventory Allocation   │
                    │ Authoritative Quote Calculation         │
                    │ Order Lookup Validation                 │
                    └──────────────┬───────────────────┬──────┘
                                   │                   │
                     ┌─────────────┘                   └─────────────┐
                     ▼                                               ▼
      ┌─────────────────────────────┐                 ┌─────────────────────────────┐
      │          ADMIN API          │                 │        WEB SALE API         │
      │                             │                 │                             │
      │ Controllers: api/admin/     │                 │ Controllers: api/web/       │
      │ Admin DTOs                  │                 │ Web DTOs (Public Safe)      │
      │ Auth: JWT + RBAC Guards     │                 │ Public: ShopResolver        │
      │ Route prefix: /admin/...    │                 │ Route prefix: /web/...      │
      │ Swagger: /docs/admin        │                 │ Swagger: /docs/web          │
      │ Spec: openapi-admin.json    │                 │ Spec: openapi-web.json      │
      └──────────────┬──────────────┘                 └──────────────┬──────────────┘
                     │                                               │
                     ▼                                               ▼
               kitty-admin-fe                                 kitty-web-nextjs
             (npm run api:sync)                             (npm run generate)
```

---

## 2. Directory Structure

Each feature module is structured to enforce clear separation at the API layer:

```text
src/
├── common/
│   ├── swagger/
│   │   └── openapi.ts          # Admin & Web Swagger document generation & isolation
│   └── shop-context/
│       ├── shop-resolver.ts    # Canonical single-shop resolver for application requests
│       └── shop-context.module.ts
│
├── modules/
│   ├── catalog/       # Catalog, categories, inventory and reference data
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   ├── admin-category.controller.ts
│   │   │   │   ├── admin-catalog-reference.controller.ts
│   │   │   │   ├── admin-inventory.controller.ts
│   │   │   │   ├── admin-product.controller.ts
│   │   │   │   └── dto/                          # Category, product and inventory DTOs
│   │   │   ├── web/
│   │   │   │   ├── dto/web-product.dto.ts
│   │   │   │   ├── dto/web-storefront-selection.dto.ts
│   │   │   │   ├── web-catalog.controller.ts     # Public Storefront Controller
│   │   │   │   └── web-catalog.mapper.ts         # Domain -> Web DTO transformer
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   │
│   ├── rentals/
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   ├── admin-rental.controller.ts    # Admin Rental endpoints
│   │   │   │   └── dto/                          # Creation, order, lifecycle, return and settlement
│   │   │   ├── web/
│   │   │   │   ├── dto/                          # Evaluation, order, lookup and account-order DTOs
│   │   │   │   └── web-rental.controller.ts      # Public Storefront Booking Controller
│   │   ├── application/
│   │   │   ├── rental-read.service.ts  # admin order reads
│   │   │   ├── rental-creation.service.ts  # offline rental creation
│   │   │   ├── rental-lifecycle.service.ts  # admin transitions and rescheduling
│   │   │   ├── rental-return.service.ts  # return preview and receipt
│   │   │   ├── rental-confirmation.service.ts  # confirmation
│   │   │   ├── rental-settlement.service.ts  # charges, collateral and settlement
│   │   │   ├── web-rental-evaluation.service.ts  # storefront evaluation
│   │   │   ├── web-rental-order.service.ts  # storefront order creation
│   │   │   ├── web-rental-lookup.service.ts  # guest order lookup
│   │   ├── domain/
│   │   └── infrastructure/
│   │
│   ├── settings/
│   │   ├── api/
│   │   │   ├── settings.controller.ts            # Admin Settings endpoints
│   │   │   └── web/
│   │   │       ├── dto/web-policy.dto.ts         # Public Policies DTO
│   │   │       └── web-policy.controller.ts      # GET /web/policies
│   │   └── ...
│   │
│   ├── web-auth/       # Public storefront identity and sessions
│   ├── finance/        # Admin-only module (no web API)
│   ├── deliveries/     # Admin-only module (no web API)
│   ├── reports/        # Admin-only module (no web API)
│   └── members/        # Admin-only module (no web API)
│
└── configure-application.ts                      # Mounts /docs/admin & /docs/web
```

---

## 3. Swagger & OpenAPI Separation

Two distinct Swagger UIs and OpenAPI JSON documents are exposed:

| Target           | Swagger UI                  | OpenAPI JSON                                        | Scope                                                   | Consumers          |
| :--------------- | :-------------------------- | :-------------------------------------------------- | :------------------------------------------------------ | :----------------- |
| **Admin API**    | `/docs/admin` (and `/docs`) | `/docs/admin-json` & `generated/openapi-admin.json` | Internal operations & full admin controls               | `kitty-admin-fe`   |
| **Web Sale API** | `/docs/web`                 | `/docs/web-json` & `generated/openapi-web.json`     | Public storefront catalog, availability, quote, booking | `kitty-web-nextjs` |

### Backward Compatibility for Legacy Consumers

`generated/openapi.json` is preserved as the Admin OpenAPI specification to prevent breaking changes for `kitty-admin-fe` scripts (`npm run api:sync`, `npm run api:check`).

---

## 4. Code Generation Workflow

1. **Backend Export**:

   ```bash
   npm run openapi:export
   ```

   Generates:

   - `generated/openapi-admin.json`
   - `generated/openapi-web.json`
   - `generated/openapi.json`

2. **Admin Frontend (`kitty-admin-fe`)**:

   ```bash
   npm run api:sync
   npm run api:check
   ```

3. **Web Frontend (`kitty-web-nextjs`)**:
   ```bash
   npm run generate
   ```
