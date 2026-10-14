# Project Architecture

> 受众: **人 + Agent**（`读者: Agent`——结构契约，须遵循）

## Core Design Principles

- **Clean Architecture (CA)**: every bounded context is split into four layers with a strict inward dependency direction: `api → application → domain ← infrastructure`. The domain depends on nothing but the shared kernel.
- **Domain-Driven Design (DDD)**: business logic lives in framework-free aggregates with value objects, domain events and repository ports. Infrastructure supplies adapters (Drizzle) for those ports.
- **CQRS**: writes go through `Command → CommandHandler`, reads through `Query → QueryHandler`, dispatched over `@nestjs/cqrs` buses. Controllers never call a service directly.
- **Vertical slices**: contexts are packaged by feature (`src/modules/<context>`), not by technical tier. Cross-context coupling only happens through domain events, never by importing another context's `domain/` or `infrastructure/`.
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
│   │   ├── infrastructure/  #   Drizzle repository adapter, mappers, event dispatcher
│   │   ├── api/             #   controller + DTOs (HTTP transport)
│   │   └── users.module.ts  #   wires CqrsModule + handlers + port→adapter binding
│   ├── auth/                # Better Auth adapter (reserved for future DDD/ES)
│   ├── stripe/              # Payment context
│   └── storage/             # Cloud storage context (S3/OSS/COS)
├── database/                # Global infra: Drizzle client, schema, migrations, seed
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
        repo.save(user)  (port → DrizzleUserRepository in infrastructure)
        eventBus.publishAll(user.pullDomainEvents())   # in-process today, event store later
  → returns PublicUser projection (201)
```

Reads (`GET /users`, `GET /users/:id`) use `Query` handlers that read the write store
directly via `DrizzleService` (pragmatic CQRS read side, bypasses the domain).

## Layer Dependency Rules

| Layer | May import | Must NOT import |
|-------|-----------|-----------------|
| `domain/` | `shared-kernel/domain`, other files in same domain | Nest, Drizzle, DTOs, HTTP, other contexts |
| `application/` | `domain`, `shared-kernel/cqrs`, `@nestjs/cqrs`/common | other contexts' `domain`/`infrastructure` |
| `infrastructure/` | `domain` (ports), Drizzle, Nest | — (it is the adapter boundary) |
| `api/` | `application` (commands/queries), DTOs | `domain` entities used as transport |

Domain purity is enforced by a test that scans `src/modules/users/domain/**` for
`@nestjs/*`, `drizzle-orm` and `@app/database` imports.

## Cross-Context Communication

Contexts never import each other's internals. Side effects that span contexts are
expressed as domain events subscribed via `@EventsHandler`. `auth`, `stripe` and
`storage` are kept as thin adapters today; `auth` is the designated slot to be
DDD/ES-ified later without disturbing the `users` pattern.

## Tech Stack

- **Runtime**: Bun (ESM, `"type": "module"`)
- **Framework**: NestJS 12 + Fastify
- **Architecture**: Clean Architecture + DDD + CQRS (`@nestjs/cqrs`)
- **Database**: PostgreSQL + Drizzle ORM (explicit migrations)
- **Authentication**: Better Auth
- **Testing**: Vitest (+ `unplugin-swc` for decorator metadata)
- **Linting/Formatting**: Biome

## Validation Note

DTOs are imported **by value** in controllers (not `import type`) so SWC preserves
`design:paramtypes` for the global `ValidationPipe`. A `useImportType` override in
`biome.json` disables the auto-fix that would otherwise rewrite these imports back to
`import type` and silently break validation.

## Deployment

- **Development**: Bun + Docker PostgreSQL (`docker-compose.dev.yml`)
- **Production**: Docker Compose (Application + PostgreSQL)
- **Docs**: Swagger/OpenAPI auto-generation (`/docs`)
