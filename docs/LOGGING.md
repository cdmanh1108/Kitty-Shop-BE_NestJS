# Application logging

The application uses Nest ConsoleLogger JSON output on stdout/stderr, with no extra dependency. Configure `LOG_LEVEL` as `fatal`, `error`, `warn`, `log`, `debug` or `verbose` (threshold including more severe levels). Default is `log` in production and `debug` otherwise. Use `log` to retain successful request/auth events. Invalid values fail environment validation.

`http.request.completed` records method, registered route template, HTTP status, elapsed milliseconds, abort state and request ID. Authenticated requests additionally include internal user/shop IDs. Unknown routes use `unmatched`: raw paths, query strings, bodies, headers, IP addresses and user agents are deliberately excluded. A request emits once on finish/close.

POST login, refresh, logout and change-password responses also emit `auth.<action>` with success/failure/aborted outcomes. These are HTTP outcome events, not database audit records; guard/validation rejections are included. Login/refresh events do not capture submitted email or response tokens. Correlate them with request ID, not attempted account identifiers.

Client request IDs accept only 1–100 ASCII letters/digits/underscore/hyphen, otherwise a UUID is generated. IDs are correlation labels, never proof of identity. Configure an upstream trusted gateway to replace IDs if authoritative correlation is required.

Structured application logs emitted inside an HTTP request are automatically enriched with its request ID unless the event already supplies one. Startup and background-job logs have no request ID.

The logger redacts sensitive object keys recursively, bounds depth/array/string size, masks common credential URL/Bearer/JWT patterns, and suppresses Error message/stack text that may include SQL values or secrets. Application error events retain exception class, event and request ID. Free text redaction cannot detect arbitrary secrets: use fixed event names and explicitly selected fields; never log a request, DTO, token, environment or raw exception string. Detailed stack diagnostics require a separate reviewed, access-controlled error reporting policy.

`http.request.failed`, `audit.persist.failed` and `reminders.refresh.failed` provide operational errors. Database audit history remains independent; its best-effort writer now enriches request metadata and sanitizes snapshots. See [RELIABILITY.md](RELIABILITY.md). Recovery/cleanup events omit idempotency keys and payloads. API response shapes and business/auth behavior are unchanged.

Deployment must collect stdout/stderr and configure retention, access controls and alerts (5xx, auth failures, audit persistence failures). This repository does not provision a log collector. No local log files/rotation are introduced. Browser/deployed collection has not been verified by unit tests.
