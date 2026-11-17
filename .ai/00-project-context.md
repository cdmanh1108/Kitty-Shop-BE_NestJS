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

PostgreSQL is the source of truth. Migration history includes an initial baseline
for a new, empty database plus additive product-configuration migrations. Existing
release databases apply pending migrations without resetting or reseeding. See
`docs/DATABASE.md` and `docs/RUNBOOK.md`; never apply the initial baseline to a
database containing data or a different Prisma migration history.
