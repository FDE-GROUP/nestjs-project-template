import { describe, expect, it } from 'vitest';
import { UserRegisteredEvent } from './user-registered.event';

// ES hook #3 contract: every domain event must carry the full envelope a future
// event store needs (append-only columns + upcast version). If any field regresses,
// the later migration to persistence would require a breaking schema change.
describe('UserRegisteredEvent ES-ready contract', () => {
  const build = () =>
    new UserRegisteredEvent({
      aggregateId: 'agg-1',
      payload: {
        id: 'agg-1',
        email: 'e@f.com',
        firstName: null,
        lastName: null,
        role: 'USER',
      },
      correlationId: 'corr-1',
    });

  it('has a uuid eventId, aggregate identity and ISO timestamp', () => {
    const event = build();
    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(event.aggregateId).toBe('agg-1');
    expect(event.aggregateType).toBe('user');
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.correlationId).toBe('corr-1');
  });

  it('declares eventType and a numeric eventVersion for upcasting', () => {
    const event = build();
    expect(event.eventType).toBe('user.registered');
    expect(event.eventVersion).toBe(1);
  });

  it('produces a JSON-serializable envelope (append-ready shape)', () => {
    const event = build();
    const json = JSON.parse(JSON.stringify(event));
    expect(json).toMatchObject({
      aggregateId: 'agg-1',
      aggregateType: 'user',
      eventType: 'user.registered',
      eventVersion: 1,
      payload: { email: 'e@f.com', role: 'USER' },
    });
    expect(typeof json.occurredAt).toBe('string');
  });
});
