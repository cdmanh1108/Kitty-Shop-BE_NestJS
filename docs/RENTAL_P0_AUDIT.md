# Rental P0 audit and implementation status

This document tracks the P0 request; it is **not a completion report**.

## Implemented so far

- Cancellation is limited to RESERVED in the canonical domain transition table and revalidated inside the Serializable transaction. A caller cannot enable CONFIRMED cancellation by supplying different `fromStatuses`.
- Rescheduling loads the effective shop policy through the existing RENTAL_POLICY_PROVIDER. The transaction rechecks duration and the original booking anchor before touching order items or allocations. The new start must be within `[createdAt, createdAt + maxDaysFromBooking * 24 hours]`. The default is centralized in Settings; no service-local 20-day constant. This is a limit on the new scheduled start, not a moving deadline based on the last update. Existing overlap/exclusion protection remains.
- Generic setting writes cannot overwrite `rental_policy`; callers must use the validated policy endpoint. Business provider reads validate the effective policy.
- Rental alphabetic search no longer includes an empty phone substring that matches all orders. Customer filtering composes with search/status/date overlap; pagination has a stable ID tiebreaker.
- Rental list persistence uses an explicit summary select. Rental response DTOs define customer, items, allocations, charges, payments, delivery summaries and status history. Response allowlists apply to normal responses and stored idempotency replays.

## Findings still requiring implementation

| Area | Observed behavior / remaining work |
| --- | --- |
| Pricing | Product/variant duration-specific rate selection is enforced; absent rate is rejected. Policy default pricing is not consumed by booking. Preserve intentional product-specific pricing when deciding fallback. |
| Confirm/start | Current transaction checks state and inventory, but not paid/collateral preconditions. RESERVED can still start directly. |
| Deposit | Finance derives cash deposit status from non-voided payments. No physical-document collateral lifecycle or settlement model exists. |
| Late return | Policy values are stored; completion does not generate semantic late fees or threshold rental charges. |
| Return condition | Completion still sends all inventory to CLEANING. Per-item AVAILABLE/CLEANING/REPAIRING/DAMAGED/LOST outcomes are pending. |
| Extra charges | Generic charge command exists. Cleaning range, actual repair/accessory values and replacement-value rules are not enforced. |
| Settlement | No authoritative deposit/charges/refund/due settlement calculation and idempotent settlement command yet. |
| Loyalty | Policy configuration exists; no earning/redemption ledger, concurrency protection or completion-triggered reward mechanism. |
| Money | Database NUMERIC(18,2), domain DecimalValue and API string serialization exist. Booking/payment state/charges still perform number arithmetic. Exact business arithmetic remains pending. |
| Idempotency | Create uses a fenced transactional claim/outbox protocol. Other lifecycle calls guard state, but do not yet provide full replay contracts for command keys. |
| Detail reads | Rental detail persistence still loads full nested records although the API now strips them. Refine domain read models and Prisma selections together. |
| Other contracts | Customer nested DTOs, Delivery, Reminder, ShopSettings and ExpenseCategory response contracts still need hardening. |
| Reports/reminders | Cash deposits are excluded from revenue. Settlement/loyalty integration and bounded reminder candidate queries remain to audit. |

## Verification notes

Use the final execution report for actual quality results. New tests cover the policy deadline, custom limits, duration revalidation, cancelled-state rejection, transactional non-mutation, search filtering, and response replay projection. Existing allocation concurrency tests remain required. A passing suite for this subset does not establish that the entire P0 task is complete.

No schema migration has been introduced in this subset. Collateral, settlement, return condition and loyalty must be modeled with additive production migrations before declaring P0 complete. FE scope remains generated API synchronization only; Orders/Customers/Calendar UI migration is a later task.

### Executed checks, 2026-09-12

- BE `typecheck`: PASS.
- BE `quality` (lint, unit tests, build, OpenAPI export): PASS, 352 unit tests. Afterwards the added recursive rental schema regression passed in the six-test contract suite, with its lint and a fresh full typecheck also passing.
- PostgreSQL integration: PASS, 76 tests / 13 suites, using an isolated disposable database migrated through all five existing migrations.
- PostgreSQL E2E: PASS, 10 tests / 3 suites, including response allowlist and idempotency replay equality.
- FE API sync/check, typecheck, lint, unit tests: PASS (253 tests).
- FE default build: failed with EPERM while removing an existing dist asset. The same build with `--outDir ../.p0-verification/fe-dist` passed. No running development process was stopped.
- Full BE and FE OpenAPI documents compare equal; generated FE types are current.
- Both repository diffs pass `git diff --check`.

The independently edited FE `ProductFormPage.tsx` was left untouched. These checks cover the implemented subset only; all unimplemented requirements above remain open.
