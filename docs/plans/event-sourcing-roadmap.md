# Event Sourcing Roadmap

> 受众: **人 + Agent**（递延方案；`读者: Agent`）

Event Sourcing (ES) is a committed future phase, deliberately deferred. This document
records (a) the hooks already wired in the current CA/DDD/CQRS build, (b) the concrete
schema and write-path switch required to turn them on, and (c) how Sagas layer on top.

The guiding rule: **do the least work now that keeps ES cheap later.** ES is a storage
paradigm (hard to retrofit), unlike CA/DDD/CQRS which are code organization (easy to
refactor) — so the seams are pre-cut, but no event store is built until a context
actually needs audit trail / replay.

## Phase A — Hooks wired today (this repo)

1. **Write path is Command → CommandHandler only.** Controllers never mutate state
   directly. Swapping a handler's persistence from CRUD to append-event touches only
   the handler + repository, never the transport.
2. **Aggregates record domain events** via `AggregateRoot.recordEvent(...)` and expose
   `pullDomainEvents()`. The repository returns the same aggregate instance so pending
   events survive to the dispatch point. See `src/shared-kernel/domain/aggregate-root.ts`
   and `src/modules/users/domain/entities/user.aggregate.ts`.
3. **The `DomainEvent` envelope is ES-shaped** — `eventId`, `aggregateId`,
   `aggregateType`, `eventType`, `eventVersion`, `occurredAt`, `correlationId`,
   `causationId`, `payload`. These are exactly the columns of an append-only store, and
   `eventVersion` is what a future upcaster keys off. A contract test locks these fields
   (`src/modules/users/domain/events/user-registered.event.test.ts`).
4. Events are currently dispatched **in-process only** via `EventBus.publishAll(...)`
   and handled by `@EventsHandler` (`.../infrastructure/dispatchers/`). Nothing is
   persisted — there is no event store, projection, snapshot, or outbox yet.

## Phase B — Turn ES on for a chosen context

Target only state-heavy contexts that need an audit trail (e.g. orders / ledger).
Stateful identity data like auth users likely stays CRUD permanently.

### Event store table (Drizzle)

```sql
CREATE TABLE event (
  id            bigserial PRIMARY KEY,        -- global sequence (global ordering)
  aggregate_id  text        NOT NULL,          -- stream id
  aggregate_type text       NOT NULL,          -- e.g. 'user'
  version       int         NOT NULL,          -- per-aggregate sequence, optimistic lock
  event_type    text        NOT NULL,          -- 'user.registered'
  event_version int         NOT NULL,          -- schema version for upcasting
  payload       jsonb       NOT NULL,
  metadata      jsonb,                         -- correlationId/causationId/actor/...
  occurred_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, version)
);
CREATE INDEX event_aggregate_idx ON event (aggregate_type, aggregate_id);
```

Add via `drizzle-kit generate` + `drizzle-kit migrate` (explicit migrations, never
`synchronize`).

### Write-path switch

- Today: `handler → repo.save(aggregate)` (INSERT/UPDATE) then `eventBus.publishAll(events)`.
- ES:    `handler → eventStore.append(aggregateId, events, expectedVersion)` — the
  aggregate's `toState()`/`rehydrate()` reconstruct current state by replaying events.
- The `pullDomainEvents()` output is what gets appended (metadata → `jsonb`). The
  command handler body is otherwise unchanged.
- Introduce an **outbox** if events must cross a process boundary transactionally with
  the append (avoid dual-write).

### Read side

- Build **projections** from the event stream into read tables; the existing `Query`
  handlers keep reading those tables — their contract does not change.
- Add **snapshots** once a stream's replay cost matters (store `aggregate_type='snapshot'`
  or a separate table; replay from last snapshot).

## Phase C — Sagas (process orchestration)

`@nestjs/cqrs` ships Sagas: an `@Saga()` generator that reacts to events and emits
commands, enabling **compensating transactions** across contexts (e.g. register →
create profile → on failure, delete auth user). This replaces the ad-hoc `@EventsHandler`
reactions in Phase A where multi-step orchestration is needed. No DB change required;
Sagas live in `application/`.

## Explicitly out of scope today

No event store, no projections, no snapshots, no outbox, no upcasters, no dual-write
concerns. These belong to Phase B/C and are gated on a real need for replay/audit.

## Reference caution

Boilerplates that brand "Event Sourcing" while only using an in-memory event bus (e.g.
`@nestjs/event-emitter` + sagas with no store/replay) are **event-driven, not ES**.
This roadmap keeps the distinction honest: Phase A is event-driven; ES begins at Phase B.
