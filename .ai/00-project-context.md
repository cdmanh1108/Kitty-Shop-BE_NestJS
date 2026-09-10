# Project context

This backend serves an admin system for a clothing/accessory rental shop.

Current admin responsibilities:

- dashboard: revenue/order/overdue/near-return KPIs.
- rental calendar: day/week/month data with customer/order/items/status.
- catalog: product, size, color, rental prices, deposit, images.
- physical inventory: available/reserved/rented/cleaning/repair/damaged/lost state + history.
- customer CRM: contact data, history and notes.
- rental orders: date range, allocated physical items, charges, deposit/payment state.
- finance: rental money, accessories, late/cleaning/damage/shipping fees, expenses/profit.
- delivery/return tracking.
- operational reminders.
- reports for revenue, products and customers.

Future direction: public landing/catalog, customer booking and online payments. Changes should not couple the current admin transport to that future UI.
