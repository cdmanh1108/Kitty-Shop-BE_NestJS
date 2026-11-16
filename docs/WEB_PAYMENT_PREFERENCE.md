# Storefront payment preference

`POST /web/rental-orders` requires the customer's preferred payment option:
`cash` or `bank_transfer`. This records a preference only. Creating an order
does not create a `PaymentTransaction`, payment URL, QR code, provider session or
receipt, and does not mark a positive-value order paid.

The preference is stored atomically in
`rental_orders.preferred_payment_method`. It is nullable because Admin-created
orders do not have a storefront preference. No value is inferred from a
receipt, collateral method or default. Admin order detail may display the
captured preference; create responses do not.

Actual receipt methods live on `PaymentTransaction.paymentMethod` and may
differ from the earlier preference. Checkout labels should describe the field
as a preferred or planned payment method, not as a completed payment.
