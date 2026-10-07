# Storefront rental order emails

## Scope

Two emails are queued for new `ONLINE` orders with an explicitly supplied checkout
email: confirmed and settled (`COMPLETED`). Creating or cancelling an order does not
enqueue an email. There are no reschedule, pickup, return or overdue emails.
Offline orders and orders without a captured email do not create email tasks. Existing
orders are not backfilled from mutable CRM or account emails. Checkout accepts an
optional contact email; Web prefills the account email only in an untouched empty field.

`rental_orders.notification_email` is captured at creation, independently of ownership.
Changing a CRM profile cannot redirect subsequent order emails. Idempotent create replay
does not enqueue again. The notification's event and order/template uniqueness prevent
duplicate logical tasks. A snapshot of customer-facing data is captured in the business
transaction; internal notes, staff identity and private evidence are not included.

## Delivery

The existing required outbox event and its `notification_logs` EMAIL consumer are
committed with the command. Database/outbox failures still reject the transaction;
network/provider failures happen asynchronously and cannot undo a successful order.
General outbox events retain their existing status for future consumers.

The worker runs every 15 seconds, processes at most 10 records sequentially per batch,
and leaves a 650 ms pause between sends. Atomic PostgreSQL `SKIP LOCKED` claims and
60-second owner-token leases support concurrent replicas. Earlier nonterminal tasks
for the same order block later tasks. Provider/inbox delivery order is not guaranteed.
HTTP requests have a 20-second deadline; mutations never wait for email requests.

Before the first send, the exact from/to/subject/HTML/text payload is saved. Retries reuse
it and the same `rental-email-{notificationId}` idempotency key. Retry delays start at
30 seconds, double and cap at one hour, for at most eight attempts. Resend retains keys
for 24 hours; automatic retry/recovery stops after 23 hours from the first attempt.
An exhausted or expired ambiguous attempt becomes `UNKNOWN` and needs provider
reconciliation before any manual resend. Permanent rejection or invalid payload is
`FAILED`. No raw provider exception, address, token or credentials are written to logs.

`SENT`/`sent_at` means Resend accepted the email and `provider_message_id` is recorded.
It does not mean delivered/read: no bounce/delivery webhook is implemented here.
Inspect `notification_logs` for `RETRY`, `FAILED` and `UNKNOWN`; this task adds no Admin
notification page or manual resend endpoint. Never clear an ambiguous record and
blindly resend after the provider's deduplication window.

## Content

Financial labels separate the order total from expected deposit, actual net rental
payment and held deposit from the ledger.
Confirmed email does not infer payment from status. Settlement includes the actual
additional collection/refund from the settlement record.
Free accessory lines are labelled explicitly. Dates use the captured shop timezone;
the template escapes all customer-controlled strings. Guest links prefill only the
order code on `/tra-cuu-don`; the existing phone check is still required. Owned orders
link to `/tai-khoan/don-hang/:orderCode`, retaining account authorization.

## Deployment

1. Apply migration `202610070002_rental_order_emails` before starting new writers.
2. Generate Prisma Client with `npm run db:generate`; Windows requires releasing an
   existing Prisma engine DLL lock before replacing the engine file.
3. Set `WEB_URL` to the storefront origin, and configure existing `RESEND_API_KEY`,
   `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` with a verified sender. Production requires
   a public HTTPS `WEB_URL`; development defaults to `http://localhost:3000`.
4. Restart the backend. `RENTAL_EMAIL_ENABLED=false` pauses dispatch but still retains
   tasks, so enabling later resumes them. Automated tests default to disabled, and
   OpenAPI export explicitly disables dispatch. No real emails are sent by contract export.

No migrations, production services or real email sends are executed by implementing
this change. No API contract shape changes are required for the existing optional email.
