# Kitty Backend — Admin API Reference

## 1. Purpose & Scope

The **Admin API** serves back-office management interfaces (`kitty-admin-fe`) and authorized staff. It provides full administrative capabilities for catalog management, rental lifecycle tracking, physical inventory management, finance & settlements, and business reporting.

---

## 2. Authentication & Authorization Boundary

- **Authentication**: Bearer JWT tokens in the `Authorization: Bearer <token>` header.
- **Tenant Scope**: Tenant context (`shopId`) is resolved strictly from the authenticated member's active shop membership (`CurrentUser`).
- **Authorization & RBAC**: Every endpoint enforces fine-grained permissions via `@Permissions(PERMISSIONS.*)`.
- **Audit Logging**: Sensitive administrative actions (order creation, status transitions, settlements, fee adjustments) automatically log audit trails with `actorUserId` and `actorMemberId`.

---

## 3. URL Routing & Backward Compatibility

Admin endpoints support dual route mounting to avoid breaking existing clients:

| Resource | Primary Admin Route | Compatibility Route | Controller |
| :--- | :--- | :--- | :--- |
| **Catalog** | `/admin/products`, `/admin/categories` | `/products`, `/categories` | `AdminCatalogController` (`api/admin/`) |
| **Rental Orders** | `/admin/rental-orders` | `/rental-orders` | `AdminRentalController` (`api/admin/`) |
| **Customers** | `/admin/customers` | `/customers` | `CustomerController` |
| **Inventory** | `/admin/inventory` | `/inventory` | `InventoryController` |
| **Finance** | `/admin/finance` | `/finance` | `FinanceController` |
| **Deliveries** | `/admin/deliveries` | `/deliveries` | `DeliveryController` |
| **Reports** | `/admin/reports` | `/reports` | `ReportController` |
| **Settings** | `/admin/settings` | `/settings` | `SettingsController` |

---

## 4. Swagger Documentation

- **Swagger UI**: `/docs/admin` (also mirrored at `/docs` for legacy access)
- **OpenAPI JSON**: `/docs/admin-json` and `generated/openapi-admin.json`
- **Client Consumer**: `kitty-admin-fe` consumes `generated/openapi.json` (identical to `openapi-admin.json`) via `npm run api:sync`.
