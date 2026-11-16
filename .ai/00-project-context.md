# Project context

This backend serves Kitty's Admin application and customer storefront for a
clothing and accessory rental shop.

Current capabilities include catalog and physical inventory, rental booking,
availability, order lifecycle, account authentication/history, favorites and
carts, delivery/return, reminders, customer loyalty, finance, reports and
transactional email notifications.

The storefront uses verified-email accounts for checkout. Admin/manual and
storefront orders share the rental lifecycle while retaining distinct immutable
creation sources and separate CRM/customer-account identities.

PostgreSQL is the source of truth. This release's migration history is one
initial baseline for a new, empty database. See `docs/DATABASE.md` and
`docs/RUNBOOK.md`; do not use this baseline to upgrade a database containing
data or another Prisma migration history.
