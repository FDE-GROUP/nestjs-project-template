import { DomainEvent, type DomainEventProps } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';

export interface UserRegisteredPayload {
  readonly id: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly role: string;
}

/**
 * Raised when a new user account is registered.
 * eventType `user.registered`, eventVersion 1 — the version an ES upcaster will key off.
 */
export class UserRegisteredEvent extends DomainEvent<UserRegisteredPayload> {
  static readonly EVENT_TYPE = DOMAIN_EVENTS.userRegistered;
  static readonly EVENT_VERSION = 1;
  static readonly AGGREGATE_TYPE = 'user';

  constructor(props: Omit<DomainEventProps<UserRegisteredPayload>, 'eventType' | 'aggregateType'>) {
    super({
      ...props,
      aggregateType: UserRegisteredEvent.AGGREGATE_TYPE,
      eventType: UserRegisteredEvent.EVENT_TYPE,
      eventVersion: UserRegisteredEvent.EVENT_VERSION,
    });
  }
}
