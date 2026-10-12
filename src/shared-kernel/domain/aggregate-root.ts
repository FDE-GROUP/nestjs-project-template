import type { DomainEvent } from './domain-event';

/**
 * Framework-free aggregate root base class (ES hook #2).
 *
 * Aggregates record domain events as state changes happen; the repository/command
 * layer pulls them at the persistence point and dispatches them. Because the events
 * carry full ES-ready metadata, "record then pull" is the exact seam a future
 * Event Sourcing store will reuse to append instead of merely dispatch.
 *
 * Must never import Nest/ORM packages.
 */
export abstract class AggregateRoot<TId> {
  private readonly _domainEvents: DomainEvent[] = [];
  private _isNew = true;

  /** Identity is provided by the concrete aggregate. */
  abstract get id(): TId;

  recordEvent(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  get domainEvents(): readonly DomainEvent[] {
    return this._domainEvents;
  }

  /** Returns the pending events and clears the internal buffer. */
  pullDomainEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents.length = 0;
    return events;
  }

  /** True while the aggregate has not been persisted at least once. */
  get isNew(): boolean {
    return this._isNew;
  }

  /** Called by the repository after a successful insert (or when rehydrating an existing row). */
  markExisting(): void {
    this._isNew = false;
  }
}
