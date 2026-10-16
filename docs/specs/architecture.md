# Project Architecture

> 受众: **人 + Agent**（`读者: Agent`——结构契约，须遵循）

## Core Design Principles

- **Clean Architecture (CA)**: every bounded context is split into four layers with a strict inward dependency direction: `api → application → domain ← infrastructure`. The domain depends on nothing but the shared kernel.
- **Domain-Driven Design (DDD)**: business logic lives in framework-free aggregates with value objects, domain events and repository ports. Infrastructure supplies adapters (MikroORM) for those ports.
- **CQRS**: writes go through `Command → CommandHandler`, reads through `Query → QueryHandler`, dispatched over `@nestjs/cqrs` buses. Controllers never call a service directly.
- **Vertical slices**: contexts are packaged by feature (`apps/api/src/modules/<context>`; shared-contract contexts live under `libs/core/src/modules/<context>`), not by technical tier. Cross-context coupling only happens through domain events, never by importing another context's `domain/` or `infrastructure/`.
- **Event Sourcing (committed, phased)**: confirmed architectural goal (human clarification 2026-10-14) — no longer gated on "a context actually needs it", while phasing and audit/migration gates stand. This phase (A) dispatches domain events in-process only. The command handler + aggregate `recordEvent/pullDomainEvents` seam and the event envelope are already ES-shaped. See [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md).
- **EDA (event-driven architecture, committed)**: domain events are the **only** cross-context integration mechanism; evolution path = in-process dispatch (landed) → transactional outbox for durable publish (Phase B) → cross-process broker subscription (only after microservice triggers fire, see [microservice-readiness.md](../plans/microservice-readiness.md)).

## Directory Structure

```
src/
├── app.module.ts            # Root module (imports shared infra + feature contexts)
├── main.ts                  # Bootstrap: Fastify, ValidationPipe, Swagger, versioning
├── shared-kernel/           # Cross-context primitives
│   ├── domain/              #   AggregateRoot, DomainEvent (pure, framework-free)
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery over @nestjs/cqrs
├── modules/                 # Bounded contexts (vertical slices)
│   ├── users/               # ★ Reference implementation of the full pattern
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/ (ports)
│   │   ├── application/     #   commands/ queries/ read-models/ (handlers)
│   │   ├── infrastructure/  #   MikroORM repository adapter, mappers, event dispatcher
│   │   ├── api/             #   controller + DTOs (HTTP transport)
│   │   └── users.module.ts  #   wires CqrsModule + handlers + port→adapter binding
│   ├── auth/                # Better Auth adapter (reserved for future DDD/ES)
│   ├── stripe/              # Payment context
│   └── storage/             # Cloud storage context (S3/OSS/COS)
├── database/                # Global infra: MikroORM client, entities, migrations, seed
├── config/                  # Global infra: typed config + Joi validation
├── logger/  mailer/  common/  i18n/   # Cross-cutting infrastructure
```

## The `users` Context (reference flow)

```
POST /users
  → UsersController (api)                 # builds CreateUserCommand from validated DTO
  → CommandBus.execute                    # @nestjs/cqrs
  → CreateUserCommandHandler (application)
        repo.findByEmail → ConflictException if exists
        User.register(...) (domain)       # invariants + recordEvent(UserRegisteredEvent)
        repo.save(user)  (port → MikroUserRepository in infrastructure)
        eventBus.publishAll(user.pullDomainEvents())   # in-process today, event store later
  → returns PublicUser projection (201)
```

Reads (`GET /users`, `GET /users/:id`) use `Query` handlers that read the write store
directly via `MikroOrmService` (pragmatic CQRS read side, bypasses the domain).

## Layer Dependency Rules

| Layer | May import | Must NOT import |
|-------|-----------|-----------------|
| `domain/` | `shared-kernel/domain`, other files in same domain | Nest, MikroORM, DTOs, HTTP, other contexts |
| `application/` | `domain`, `shared-kernel/cqrs`, `@nestjs/cqrs`/common | other contexts' `domain`/`infrastructure` |
| `infrastructure/` | `domain` (ports), MikroORM, Nest | — (it is the adapter boundary) |
| `api/` | `application` (commands/queries), DTOs | `domain` entities used as transport |

Domain purity is guarded by the **fallow architecture-boundary advisory** in `pnpm run ci`
(`scripts/ci.ts`, non-blocking; its findings require a second human check per
[tooling-standards.md §4.7](./tooling-standards.md)). There is **no** test that scans
`apps/api/src/modules/users/domain/**` for `@nestjs/*`, `@mikro-orm/*` or `@app/database`
imports — layer direction is additionally held by the per-layer import matrix above and by
code review.

## Cross-Context Communication

Contexts never import each other's internals. Side effects that span contexts are
expressed as domain events subscribed via `@EventsHandler`. `auth`, `stripe` and
`storage` are kept as thin adapters today; `auth` is the designated slot to be
DDD/ES-ified later without disturbing the `users` pattern.

## Constant Contract Placement

A constant's home is decided by its **qualification as a contract**, not by reuse count:

1. **Contract-qualified**: any constant read across context boundaries, process boundaries
   (HTTP responses / event envelopes), or the durability stream (outbox/relay) must live in
   the contract dictionary layer — event names in `DOMAIN_EVENTS`, business error codes in
   `ERROR_CODES`—single-sourced literals, each **bidirectionally locked** by its mechanism
   (rehydration registry / error-code response tests). New constants of this class always
   go into the dictionary first.
2. **Context-owned enums**: domain state-machine enums (`TENANT_STATUS`, `SUBSCRIPTION_STATUS`,
   PLANS, etc.) stay inside their **owning context**; if the enum is part of an event payload,
   it cohabits with the event class under the producing context on the core side (consumers
   importing it are importing the contract itself—legitimate). Never hoist them into any
   global hub in the name of centralization.
3. **Non-contract constants stay out**: result-object literals and read-model internal shapes
   (`as const` implementation details) do not become contracts by virtue of reuse—no
   centralizing, no promoting.

Corollary: **no global `constants/` hub** (every context evolution would have to touch the
hub = a cross-cutting god module, violating vertical slices); anti-scattering is enforced by
mechanism (single-source dictionaries + lock tests + relay rejecting unknown types), not by
directory centralization.

## Tech Stack

- **Runtime**: Node LTS ≥22 (ESM, `"type": "module"`) + pnpm (package manager)
- **Framework**: NestJS 12 + Fastify
- **Architecture**: Clean Architecture + DDD + CQRS (`@nestjs/cqrs`)
- **Database**: PostgreSQL + MikroORM (explicit migrations)
- **Authentication**: Better Auth
- **Testing**: Vitest (+ `unplugin-swc` for decorator metadata)
- **Linting/Formatting**: Biome

## Validation Note

DTOs are imported **by value** in controllers (not `import type`) so SWC preserves
`design:paramtypes` for the global `ValidationPipe`. A `useImportType` override in
`biome.json` disables the auto-fix that would otherwise rewrite these imports back to
`import type` and silently break validation.

## Pagination Contract

Two envelopes live in `shared-kernel/domain/pagination.ts` (pure, framework-free) and are the
only sanctioned list-result shapes — build list endpoints on them, never ad-hoc `{rows, count}`:

- **`CursorPage<T>` (`items` + `hasMore` + optional opaque `nextCursor`) is the DEFAULT for new
  list endpoints.** It is keyset pagination over a deterministic total order — the reference
  binding is `(createdAt DESC, id DESC)` (id is the unique tiebreaker for same-timestamp rows) —
  so it stays correct and index-friendly as data grows, with no `OFFSET` scan. The cursor is an
  opaque base64url of the sort key: it hides storage internals and is **not** an authorization
  substitute (tenancy guards still run). Malformed cursors are a 400, surfaced by the adapter's
  `decodeCursor`, after the DTO has already gated the character set.
- **`Page<T>` (offset: `items` + `total` + echoed `limit`/`offset`) is the exception**, retained
  for admin/governance surfaces that need a total count or arbitrary-page jump. It is not
  removed; migrating an offset endpoint to cursor is a deliberate, per-endpoint breaking change.

Both are constructed only via `createPage` / `createCursorPage` (the single shape-discipline point,
which shallow-copies `items`). Requests enter through `ListPageDto` / `ListCursorDto` on the API
side and reach the port as `PageRequest` / `CursorPageRequest`.

## Deployment

- **Development**: Node + pnpm + Docker PostgreSQL (`docker-compose.dev.yml`)
- **Production**: Docker Compose (Application + PostgreSQL)
- **Docs**: Swagger/OpenAPI auto-generation (`/docs`)

## Appendix: Table Ownership Discipline

> Introduced by the microservice-readiness initial slice (2026-10-14). The machine-readable
> owner list is the single source of truth in `apps/api/src/database/table-ownership.ts`;
> this appendix states the semantics only — never copy the list here.

- **Strict on the write side**: any `insert/update/delete` target table must belong to the
  bounded context owning the file (`modules/<ctx>/**`; `tenancy/**` counts as `tenants`).
  Enforced in CI by `table-ownership.guard.test.ts` (grep-level scan, no AST toolchain).
- **Lenient on the read side**: cross-context `select/join` is allowed and is the natural
  shape of CQRS read-models / governance statistics; it is governed by file placement
  (read-models) and audit, not by the guard.
- **Cross-context FKs** may only point at auth-core tables (aligns with the S2 repository
  chokepoint convention).
- **Declared exceptions only**: every legitimate write-side crossing must appear in
  `WRITE_EXCEPTIONS` with a reason and plan attribution; the guard fails on stale
  (unconsumed) exceptions, so no silent exemptions accrue.
- **New tables** must be registered in `table-ownership.ts` (owner set) as part of the
  migration change, reviewed at the audit gate. The `event` table is owned by the
  `database` infrastructure (ES port exclusive writes); business repositories must never
  append to it directly.
