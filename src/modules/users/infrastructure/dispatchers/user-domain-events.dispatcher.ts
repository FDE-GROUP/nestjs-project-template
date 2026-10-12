import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';

/**
 * In-process reaction to a user registration.
 *
 * Today it is a no-op seam. In the Event Sourcing phase this is where the event
 * is appended to the event store (and/or a read projection is updated) — the
 * handler contract does not change.
 */
@EventsHandler(UserRegisteredEvent)
export class UserRegisteredEventHandler implements IEventHandler<UserRegisteredEvent> {
  private readonly logger = new Logger(UserRegisteredEventHandler.name);

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs EventBus
  handle(event: UserRegisteredEvent): void {
    this.logger.debug(
      `user.registered dispatched: eventId=${event.eventId} aggregate=${event.aggregateId} v${event.eventVersion}`,
    );
  }
}
