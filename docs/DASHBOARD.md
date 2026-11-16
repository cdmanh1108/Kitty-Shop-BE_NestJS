# Dashboard

`GET /api/v1/admin/dashboard/summary` is the shop-scoped read model for the
Admin home screen. It requires `dashboard.view`; it does not require customer,
rental, or finance permissions.

The response contains current revenue and rental summaries, due/overdue work,
outstanding amounts, operational attention counts, and bounded preview rows.
Order and report links in the client are shown only when the user has permission
for the destination.

The dashboard is a read-only aggregate. It does not create or mutate orders,
payments, customer data, or inventory. For the exact response contract, use the
Admin OpenAPI document generated from the current backend.
