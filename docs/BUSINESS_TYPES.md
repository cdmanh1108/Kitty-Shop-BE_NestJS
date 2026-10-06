# Business types and compatibility

## Vocabulary ownership

| Concept                                                | Canonical owner                        | Persistence / API                                                      |
| ------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- |
| Rental lifecycle, item state, allocation state         | `rentals/domain/rental-status.ts`      | Existing uppercase strings; separate concepts even when values overlap |
| Rental charge type                                     | `rentals/domain/charge-type.ts`        | Existing charge values                                                 |
| Order payment, deposit, transaction and expense states | `finance/domain/payment-status.ts`     | Separate vocabularies, not one generic payment status                  |
| Payment direction, purpose and method                  | `finance/domain/payment-types.ts`      | Existing values and validation                                         |
| Product and inventory state                            | `catalog/domain/catalog-status.ts`     | Product and physical inventory remain separate                         |
| Delivery state, direction and method                   | `deliveries/domain/delivery-status.ts` | Existing values and validation                                         |
| Customer state                                         | `customers/domain/customer-status.ts`  | ACTIVE / BLOCKED                                                       |

DTO validation and Swagger reuse these constants without changing enum ordering or
defaults. Validated payment creation, delivery and inventory mutation inputs carry
the corresponding literal unions through application and repository contracts.
Rental transition targets use RentalStatus. Long persistence inputs reuse the named
P0 port contracts through `Parameters<Repository['operation']>` rather than duplicating
their shapes. Existing report/dashboard read models remain sufficient.

The schema stores statuses as VARCHAR, not Prisma enums. Read records and legacy
unrestricted filters deliberately retain string types: narrowing unvalidated persisted
values by assertion would be unsound, while rejecting them would change behavior.
Auth/member vocabulary is outside this change. OVERDUE remains derived; it is not a
new rental lifecycle status. SQL literals and some persistence defaults remain literal
at the storage boundary; they must match their feature's vocabulary.

`rental-policy.ts` owns the existing transition source lists and reschedule eligibility.
In particular, cancellation still accepts RESERVED and CONFIRMED, and completion still
sends inventory to CLEANING. This cleanup does not implement different client policies.

## Money convention

- PostgreSQL monetary columns remain NUMERIC/DECIMAL(18,2). Prisma supplies Decimal.
- Commands and existing calculations use JavaScript numbers. There is no Money alias,
  wrapper, new rounding, currency conversion or change to deposit/revenue separation.
- Read contracts use the structural `DecimalValue` interface; their runtime Decimal
  values remain intact and JSON-serialize as strings. Raw report SQL deliberately
  returns monetary aggregates as text, also unchanged.
- Existing computed numeric outputs (bookable price/deposit, dashboard totals,
  customer payment summaries and reminder deposit requirements) remain numbers.
- `database/prisma/decimal-mapping.ts` centralizes the existing `Number(value)` conversion
  at those persistence boundaries. It accepts Decimal or an already numeric fallback,
  not null. Call sites retain their existing null/zero decisions. No implicit rounding
  is performed. PostgreSQL's existing column scale behavior is unchanged.
- `calculateOrderPaymentState` remains the sole transaction-history payment/deposit
  resolver. Its refund precedence and exact thresholds are unchanged. Creation-time
  zero-total defaults remain as before. Other calculations with different semantics
  (charges, discounts, refund limits) remain with their owning operations.

JavaScript number arithmetic retains its existing precision limits; this refactor
does not make the full DECIMAL(18,2) range lossless after numeric conversion. A future
precision redesign needs an explicit API/business decision, not a silent helper change.

## Rental cycle pricing foundation (RP01)

Settings owns `domain/rental-pricing-policy.ts` and publishes the typed policy and
its pure validator through `settings/public/rental-policy.ts`. The configuration
is stored in the existing `app_settings` JSON entry `rental_policy.rentalPricing`:

| Field                   | Default | Meaning                                                   |
| ----------------------- | ------: | --------------------------------------------------------- |
| `defaultRentalPrice`    |   50000 | Price of the first rental cycle and each subsequent cycle |
| `additionalDayFee`      |   10000 | Fee for a day that does not begin a new cycle             |
| `bulkQuantityThreshold` |       3 | Ordinary physical units required for the longer cycle     |
| `standardRenewalDay`    |       5 | First renewal day below the quantity threshold            |
| `bulkRenewalDay`        |       8 | First renewal day at or above the threshold               |
| `maxOnlineRentalDays`   |       9 | Maximum storefront duration to enforce in RP03            |

Existing JSON entries missing the new fields receive these independent defaults
when read. No migration, seed, automatic database write or historical repricing
is required. Rental pricing PATCH has its own DTO: all fields are optional, an
omitted field retains its value, zero remains zero, and explicit null is rejected.
Only supplied fields are merged; DTO defaults must not overwrite saved settings.
All effective fields participate in the existing settings audit snapshot.

Money settings are nonnegative whole VND up to 100,000,000. Renewal days are
integers from 2 through 365; the bulk renewal day cannot precede the standard day.
The quantity threshold is 1 through 1,000 and the online duration is 1 through 365.
Settings validation runs before saving, including for application callers.

Rentals owns the separate pure `domain/rental-cycle-pricing.ts` resolver. Its
`billableQuantity` is the total number of ordinary physical units in the order,
including paid accessories, regardless of product/variant grouping or a zero
price override. Complimentary accessories do not contribute. The result is the
price of **one unit for the entire duration**; the caller applies line quantity.
Inventory, deposits, shipping and charges are outside this calculation.

For duration `d` and renewal day `r`, the cycle length is `r - 1`:

```text
cycleCount = 1 + floor((d - 1) / (r - 1))
additionalDayCount = d - cycleCount
unitRentalPrice = cycleCount * cyclePrice + additionalDayCount * additionalDayFee
```

Defaults therefore produce renewal days 1, 5, 9, 13 for orders below three units,
and 1, 8, 15, 22 for orders with at least three. The new cycle price replaces the
10,000 daily fee on those days. At 50,000 per cycle, a below-threshold unit costs
130,000 on day 5 and 210,000 on day 9; an at-threshold unit costs 160,000 on day 8
and 170,000 on day 9. Explicit item price overrides take precedence over order
overrides, then the shop price, and apply to every cycle. Zero is a valid override.
Both supplied override levels are validated, even when the item level wins.

The resolver accepts up to two decimal places for explicit price overrides to
retain existing command money precision. Arithmetic uses integer cents internally,
then returns the existing computed-number API convention. Unsafe numeric totals
and invalid durations, quantities or prices raise safe Vietnamese domain errors.
It does not clamp an invalid duration into a one-day booking.

`domain/rental-pricing-version.ts` identifies unversioned historical snapshots
as `LEGACY_RATE_V1` and new resolver results as `CYCLE_V1`. Unknown explicit
versions fail rather than silently choosing a pricing formula. RP01 prepares this
version and calculation breakdown; persisting complete order snapshots belongs
to RP03. `resolveRentalPricing`, existing catalog rates, storefront quotes, order
creation and legacy late-return calculations continue their previous behavior
until their respective RP tasks integrate the new capability. Public Web policy
and booking responses are unchanged in RP01; Admin settings OpenAPI is expanded.

## Business time and reference numbers

`common/clock/clock.ts` declares the framework-free Clock port and CLOCK token.
SystemClock implements system time; ClockModule exports its provider and is explicitly
imported by Reminders, Dashboard and Reports. Fixed-clock tests cover reminder boundary
classification, shop-local day/month windows and the default preceding 30-day report.

Date parsing still uses Date directly. Auth/security, idempotency expiry, health,
logging and persistence/history timestamps remain unchanged. Finance's default paidAt
records an event timestamp rather than a time-based decision and remains system time.

`generateDatedReference` shares the existing RT/PAY/EXP generation algorithm:
`PREFIX-YYYYMMDD-XXXXXX`, using UTC date and three random bytes in uppercase hex.
Customer codes deliberately keep `CUS-<base36 timestamp>-<4 hex characters>` because
their format differs and is not duplicated. Random codes are not collision-proof;
database unique constraints and existing error handling remain authoritative.

## Errors and verification

Invalid rental intervals now raise InvalidRentalIntervalError with the same message.
RentalOverlapError, CatalogInvariantError and FinanceInvariantError are reused with
their existing application-to-HTTP mappings. Application HTTP exceptions remain in
place to preserve response behavior; no global exception filter redesign is included.

`test/business-primitives.spec.ts` covers monetary serialization/conversion, payment
thresholds/refunds, rental policy, typed interval errors, reference format and all three
Clock consumers. The existing persistence and architecture tests continue to guard
transaction delegation and inner-layer import boundaries. No database is mutated by
these tests; PostgreSQL integration/concurrency coverage runs through the existing
guarded test harness described in [TESTING.md](TESTING.md).
