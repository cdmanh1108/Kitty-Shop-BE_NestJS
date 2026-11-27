# Release runbook

## Làm mới sản phẩm trên web khách

Đặt cùng một `STOREFRONT_REVALIDATION_SECRET` trong `.env` của API và trong môi
trường Production của web khách trên Vercel. Dùng 32 byte ngẫu nhiên mã hóa thành
64 ký tự hex. Đặt `STOREFRONT_REVALIDATION_ORIGIN` chỉ trên API. Dùng origin HTTPS
chính thức của web khách, ví dụ `https://www.tiemthuedokittycantho.id.vn`, nơi phục vụ
trực tiếp và không chuyển hướng. Triển khai web khách trước rồi tạo lại container API.

Sau khi Admin lưu sản phẩm, phân loại, ảnh, danh mục hoặc thay đổi liên quan đến
giá thuê và bộ lọc, API báo cho web khách làm mới các trang có dữ liệu đó. Khách
đang mở trang có thể tải lại để xem dữ liệu mới. Nếu bỏ trống cả hai biến phía API,
hoặc khi web khách tạm thời không nhận được thông báo, cache tự làm mới theo mốc
5 phút cho sản phẩm và 15 phút cho danh mục. Kết quả lưu Admin vẫn được giữ. Khi
có lỗi gửi, xem log `storefront.cache.invalidation_failed` của API.

## payOS checkout

Apply `202611230002_payos_rental_payments` before serving the new application version. See [payOS rollout](PAYOS.md) for the disabled deployment, webhook verification and enable steps.

## Cash-only deposits and checkout quotes

Apply `202611230001_cash_only_rental_deposits` with the deployment migration command before switching traffic. This migration drops the document collateral columns and assumes no document collateral confirmations or settlements exist. The release seed accepts this migration on a new database.

Release the backend, storefront and Admin together. Storefront checkout sends the complete reviewed quote and Admin confirmation sends the received deposit amount. Refresh open tabs after the deployment.

## Per-product free accessory limits

Apply `202611170001_product_free_accessory_limit` with `npm run db:migrate` (or the deployment's migrate container) before switching application traffic. This additive migration sets every existing product to 1 and defaults new products to 1. Do not reset or reseed the database. Admin can edit a product's nonnegative integer limit; 0 grants no free units.

Deploy backend, storefront and Admin together and refresh open tabs. The storefront validates the exact quote allowance against current canonical product metadata. Previous fixed 1:2 builds cannot be mixed with per-product builds. Existing order lines keep their saved roles, prices and allocations.

Smoke-test default 1, custom 2/3, zero, pooled mixed-product limits, reducing paid quantities and lowering a product limit between quote and create. Verify that pricing tiers still count only paid physical units and that stock remains shared between paid/free lines.

## Update an initialized release database

For this release update, configure both applications before deploying:

1. Put the same independent random 64-hex `WEB_BFF_CLIENT_CONTEXT_SECRET` in
   backend server `.env` and Vercel Production (Preview too if used). Keep it
   server-only. See [BFF client identity](WEB_BFF_CLIENT_CONTEXT.md).
2. Backend `CORS_ORIGINS` must contain the exact HTTPS origins of **both Admin
   and the storefront**, separated by commas. The Web BFF forwards `Origin`;
   allowing only Admin causes storefront authentication to return 403.
3. Vercel `BACKEND_BASE_URL` must use HTTPS and the real `/api/v1` prefix;
   `NEXT_PUBLIC_SITE_URL` is the public storefront origin. Production backend
   must keep `AUTH_OTP_BYPASS_ENABLED=false`.
4. Deploy **storefront → backend API → Admin** for the first rollout of these
   changes. Storefront signs auth context before the backend requires it; the
   backend must support expense idempotency before the updated Admin is used.
   Existing initialized release databases use only pending migrations, as below.
5. Recreate the API container after changing server `.env`; redeploy Vercel
   after changing environment variables. Compose reads `.env`, not a local
   developer `.env.production`. Local env edits do not update either cloud.
6. Finish or review any in-flight/uncertain order or expense before reloading
   existing Admin tabs: the new recovery marker cannot reconstruct an intent
   sent by an older bundle. Reload storefront tabs too; older clients that omit
   the optional expected-account assertion retain their previous behavior.
   Smoke-test Web login/refresh, registration/OTP,
   profile, cart, checkout and history, then Admin login, rental creation/retry
   and expense creation/retry. Change accounts in another tab while cart sync
   is pending and confirm the previous account's draft is not saved to the new one.

Do not rotate only one side of the BFF secret on a live installation. Both sides
need the same value; follow the coordinated rotation note in the BFF document.

For a database already initialized with `202610230001_initial_release`, apply
subsequent committed migrations with the one-off migrator (or `npm run db:migrate`
from a configured source checkout), then deploy the matching API and FE builds.
The product rental-price migration adds a nullable column and preserves data;
do not reset or seed the existing release database for that update. See
[Product rental pricing](PRODUCT_RENTAL_PRICING.md).

## New-database release

This release expects a separately provisioned, empty PostgreSQL database. Its
Prisma history has one initial-release baseline and is not an upgrade path for an
existing database. Do not run `prisma migrate deploy` against the old Azure
database or any database containing business data.

Before migration, confirm the target database is empty and that its PostgreSQL
server allows `pgcrypto`, `btree_gist`, `pg_trgm`, and `unaccent`. On Azure,
`unaccent` may need to be added to the `azure.extensions` server parameter by a
server administrator. Then configure the deployment secret `DATABASE_URL` for
the **new** database and run the one-off migrator:

```bash
docker compose --profile migrate pull migrate
docker compose --profile migrate run --rm migrate
docker compose --profile migrate run --rm migrate npm run db:seed
```

Verify the migration completed, the seed created the intended initial shop,
admin and approved catalog records, and the API health endpoints are ready before switching
traffic. Keep the old database isolated until the owner has completed their
data-retention and cutover decisions; this runbook never drops it.

## Local setup

```bash
npm ci
npm run bootstrap
npm run start:dev
```

`npm run bootstrap` prepares `.env`, starts local PostgreSQL when configured,
applies the baseline, seeds RBAC/shop/admin plus the approved catalog, and exports OpenAPI.
For an existing local PostgreSQL server, configure `DATABASE_URL` and set
`DB_AUTO_START=false` first.

See [Release seed](RELEASE_SEED.md) for catalog counts, local reset commands,
explicit environment-file selection and protection of later business edits.

## Production configuration

- Use managed PostgreSQL with backups and a rehearsed restore procedure.
- Set signing keys and database credentials through a secret manager.
- Remove or rotate seeded administrator credentials before serving traffic.
- Set `NODE_ENV=production` and exact `CORS_ORIGINS`; do not use `*` with
  credentialed requests.
- Enable `TRUST_PROXY` only behind a trusted proxy/load balancer.
- Set `SWAGGER_ENABLED=false` when public API documentation is not wanted.
- Run the migrator once, then deploy the API and frontend builds that match the
  exported Admin/Web contracts.
- Collect structured application logs and PostgreSQL metrics; alert on 5xx rate,
  connection exhaustion, migration failures, and storage growth.

## Backups and incidents

Back up PostgreSQL and test restores regularly. Product media is stored in
object storage; back up its objects according to the provider policy.

If an overlapping reservation is reported, do not disable the exclusion
constraint. Inspect allocation state and exact timestamps, then reconcile the
orders before changing inventory state.

Payment transactions are the money-movement history. Do not edit a completed
transaction to repair a mismatch. Void the incorrect entry, record the correct
one, and verify order payment/deposit state.

See [Authentication security](AUTH_SECURITY.md), [Logging](LOGGING.md), and
[Database](DATABASE.md) for detailed boundaries and configuration.
