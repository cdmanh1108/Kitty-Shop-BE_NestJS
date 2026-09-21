# Web payment preference

`POST /web/rental-orders` requires `paymentMethod` as the customer's stated
preference at checkout. The accepted values are `cash`, `bank_transfer`, and
`momo`. They describe neither a shop capability nor a completed payment:
creating an order does not create a `PaymentTransaction`, payment URL, QR code,
provider session, or receipt, and it does not mark a positive-value order paid.

The preference is stored atomically in
`rental_orders.preferred_payment_method`. It is nullable so pre-existing orders
and Admin-created orders remain “not supplied”; no value is inferred from a
receipt, collateral method, or a default. The database check allows only the
three Web values when present.

Admin order detail exposes `preferredPaymentMethod`; public create and lookup
responses intentionally do not. Actual receipt methods continue to live on
`PaymentTransaction.paymentMethod` and may differ from the earlier preference.

## C27 handoff

| Request field   | Required | Values                          | Meaning                                             |
| --------------- | -------- | ------------------------------- | --------------------------------------------------- |
| `paymentMethod` | Yes      | `cash`, `bank_transfer`, `momo` | Customer's requested method, stored with the order. |

Checkout labels must describe this as “phương thức mong muốn/dự kiến”, not a
successful payment or integrated MoMo checkout. Reuse the same idempotency key
only for the same preference: it is part of the Web create-order request hash.
There is no payment URL, provider transaction ID, or payment success state to
display from this endpoint.
