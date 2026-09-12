# Roadmap / deliberate extension points

The current codebase focuses on the admin system. These are intentionally not forced into V1, but the schema/architecture leaves room for them.

## Public/customer web

Potential modules: customer accounts, public collections/lookbook, favorites, carts, booking requests, reviews, promotions and online payment sessions. Reuse the existing Product → Variant → Inventory availability and Rental Order engine.

## Integrations

Use `outbox_events` + a retrying dispatcher for Zalo, SMS, Messenger, email, webhooks, search indexing or analytics. Do not perform external network calls in the core order transaction.

## Advanced finance

If bookkeeping/accounting requirements become formal, add a double-entry ledger rather than overloading `payment_transactions` and `expenses`.

## Multi-tenant SaaS hardening

Before selling the platform to unrelated shops: PostgreSQL RLS/composite tenant FKs, per-tenant quotas, plan/billing domain, tenant-aware background workers and security review.

## Storage

`product_media` already stores storage keys/URLs. A provider-neutral S3-compatible adapter and public URL resolver are implemented. Admin upload UX and private authorized document access remain future work; see OBJECT_STORAGE.md.

## Observability

Add OpenTelemetry traces/metrics and an error-tracking provider when deployment infrastructure is selected. The code already propagates a request ID for log correlation.
