# Production dependency security

## Release baseline — 2026-11-16

The backend remains on Node 22, Nest 11 and Prisma 6. Commit `package.json` and
`package-lock.json` together and deploy with `npm ci`; the lockfile contains the
patched transitive packages that Express permits within its dependency ranges.

| Dependency                                | Release version | Purpose                                                                |
| ----------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| Nest common/core/platform-express/testing | 11.2.10         | Keep the HTTP adapter and framework on the same version.               |
| Nest config                               | 4.0.4           | Uses patched Lodash.                                                   |
| Nest Swagger                              | 11.4.8          | Uses patched js-yaml and Lodash.                                       |
| body-parser                               | 2.4.0           | Fixes the compressed-request trailing-byte process crash.              |
| Multer                                    | 2.5.0           | Includes the multipart/upload security fixes.                          |
| proxy-addr                                | 2.0.8           | Includes the IPv4-mapped IPv6 trust-subnet fix.                        |
| qs                                        | 6.17.1          | Resolves the outstanding qs advisory within Express's supported range. |

The default JSON and URL-encoded parsers remain enabled. No changes to body-size
limits, upload limits, allowed image types, authentication or trusted proxies are
needed for this dependency update. Existing product and rental evidence uploads
continue to use bounded, single-file, in-memory interceptors without asynchronous
`fileFilter` callbacks.

Upstream references:

- [body-parser compressed-body crash](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [Multer asynchronous fileFilter crash](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)
- [proxy-addr trust-subnet issue](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)

## Remaining Prisma tooling advisory

`npm audit --omit=dev` still reports **3 high-severity dependency entries**:
`prisma`, `@prisma/config` and `deepmerge-ts`. These are one dependency chain
for [the recursive-object merge advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
not three independent exploits. Prisma remains at 6.19.3; its config package uses
deepmerge-ts 7.1.5. npm's proposed fix upgrades Prisma to major 7, while directly
forcing deepmerge-ts 8 would replace a major outside the config package's range.
Neither is included in this release patch.

The application imports the generated `@prisma/client` for database access.
`prisma/config` is used only by the repository-owned `prisma.config.ts` for CLI
commands. No application source imports deepmerge-ts or accepts Prisma
configuration from HTTP requests. The advisory requires recursive JavaScript
object graphs; ordinary parsed JSON cannot create these references. On that
basis, no reachable HTTP exploitation path has been identified in this backend.
This assessment is not a patched-version claim or proof of absence of all risk.

The Prisma CLI can still be retained in a production dependency tree through
the client's optional peer, and is intentionally included in the separate
migrator image. Therefore these findings must remain visible in audit output;
they are not suppressed or hidden by changing the audit threshold. Keep config
files and migration commands restricted to trusted repository/deployment input.
Revisit this chain during a separately tested Prisma upgrade or supported patch.

## Verification

Run the registry advisory lookup independently of deterministic local gates:

```bash
npm audit --omit=dev
npm run db:generate
npm run typecheck
npm run format:check
npm run quality
```

Audit output is time-dependent. The snapshot above reduced the affected
production dependency entries from 12 to 3, with no remaining critical entries;
the remaining entries are the Prisma tooling chain described above.

`test/unit/request-parser.spec.ts` starts a database-free Nest probe in a child
process using the real application configuration and default parser. It verifies
normal JSON/gzip requests and sends trailing deflate bytes only after the parser
has entered the handler. It also sends a completed gzip frame followed by a
larger invalid tail and waits for delayed stream errors. A subsequent health
request must succeed and the child must exit normally. Process isolation ensures
a parser regression cannot crash the Jest runner.

A local negative control loaded body-parser 2.3.0 only in an isolated test
process: the gzip-tail probe terminated with an unhandled `Z_DATA_ERROR`. The
same probe passed with the release's body-parser 2.4.0. The old package was not
installed into the backend or exercised against any deployed server.

See [Testing](TESTING.md) for HTTP/upload E2E verification with a disposable
PostgreSQL database.

Validation on 2026-11-16:

- Prisma client generation, typecheck, format check and `npm run quality` passed.
- 772 database-free tests in 85 suites, plus 18 Swagger tests, passed; the
  production build and entrypoint verification passed.
- All 67 HTTP E2E tests in 18 suites passed, including product media uploads and
  rental confirmation evidence. Both committed migrations applied to a fresh,
  owned PostgreSQL 17 test container. No runtime database was used.
- OpenAPI freshness checks passed after the framework/Swagger updates.
- The test container and the isolated negative-control package were removed
  after verification. No schema, migration or business-flow change was needed.
