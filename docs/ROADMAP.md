# Deliberate extension points

Current released capabilities are documented in the API, architecture and
runbook guides. The items below are optional product/platform work and are not
required for the current release.

## External integrations

The outbox supports reliable asynchronous side effects. Email delivery is
implemented; new providers such as Zalo, SMS, payment webhooks, search indexing
or analytics should use dedicated consumers and must not make network calls
inside rental transactions.

## Accounting

If formal bookkeeping requirements are introduced, design a double-entry
accounting ledger instead of overloading rental payment transactions and
operating expenses.

## Multi-shop SaaS

Before offering Kitty as shared SaaS for unrelated shops, review row-level or
composite shop isolation, per-shop quotas, billing, background-worker scope and
the complete authorization model.

## Observability

The application propagates request IDs for log correlation. Add tracing,
metrics and an error-tracking provider when deployment infrastructure and
operational ownership are selected.
