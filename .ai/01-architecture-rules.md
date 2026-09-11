# Architecture rules for AI changes

## Dependency rule

`api -> application -> domain <- infrastructure`

`domain` has no NestJS/Prisma/HTTP dependency. Infrastructure implements domain ports. Do not inject PrismaService directly into controllers or application services.

## Module ownership

A module owns its business rules and persistence adapter. Other modules should call exported application services or explicit ports. Avoid circular module imports and `forwardRef` as a design strategy.

## Transaction ownership

Place a transaction around the full consistency boundary. Order creation includes order rows, snapshots, allocations, charge rows, histories and outbox record. Payment recording includes the transaction plus payment/deposit state recomputation.

## DTOs

Transport DTOs live under `api/`. Validate every externally controlled field. Use `class-transformer` only for deliberate conversion. Never accept arbitrary Prisma `data` objects from clients.

Application/domain must not import API DTOs. Controllers call API-local mappers that return plain application inputs in `application/*.contracts.ts`. Repository ports expose explicit criteria/data and read models; never use `unknown` for public results. Generic pagination lives in `common/types/pagination.ts`, independently of validation/Swagger DTOs. See `docs/APPLICATION_CONTRACTS.md` for JSON/decimal compatibility boundaries.

## Status changes

Validate transition rules in the application layer and update related aggregates/history atomically in infrastructure. Avoid generic “setStatus(status: string)” endpoints for important lifecycles.
