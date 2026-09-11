# AI / coding agent instructions

Read these files before making architectural changes:

1. `.ai/00-project-context.md`
2. `.ai/01-architecture-rules.md`
3. `.ai/02-domain-invariants.md`
4. `.ai/03-change-checklist.md`
5. `docs/DATABASE.md`

Non-negotiable rules:

- preserve Product → ProductVariant → InventoryItem separation.
- preserve RentalOrderItem → RentalItemAllocation separation.
- never implement booking safety only as an application SELECT; keep DB overlap protection.
- deposits are not revenue.
- do not hard-delete financial/order history.
- controllers stay thin; business orchestration belongs in application services.
- application/domain must not import API DTOs; controllers map validated transport DTOs into application-owned inputs.
- repository ports use explicit typed results and inputs, with no `unknown` escape hatch or transport pagination dependency.
- application/domain layers must not issue Prisma queries directly.
- client-supplied `shopId` is never authorization; use authenticated membership.
- new API input must use validation DTOs and Swagger metadata.
- new schema changes require committed migration + schema update + docs when invariants change.
- run `npm run quality` and `npm run openapi:export` before considering a contract change complete.

When uncertain, prefer a small explicit module/port over cross-module imports or shared god-services.
