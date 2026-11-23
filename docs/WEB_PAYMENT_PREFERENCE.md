# Storefront payment selection

`POST /web/rental-orders` accepts `cash`, `bank_transfer` or `payos`.
Cash and manual bank transfer record a customer preference. A positive payOS
order also persists a payment attempt inside the booking transaction. The
customer opens the hosted link in a separate account-owned request.

The preference lives on `rental_orders.preferred_payment_method`. Admin-created
orders leave it null. Collected amounts and actual payment methods are derived
from `PaymentTransaction`, which distinguishes payOS receipts from manual entries.
See [payOS rollout and accounting](PAYOS.md).
