import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { describe, expect, it, vi } from 'vitest';
import { DefaultDomainEventPublisher } from './domain-event-publisher';

function makeEvent(): DomainEvent {
  return {
    eventId: 'evt-1',
    aggregateId: 'user-1',
    aggregateType: 'user',
    eventType: 'user.registered',
    eventVersion: 1,
    occurredAt: new Date(),
    payload: { id: 'user-1' },
  } as unknown as DomainEvent;
}

function makePublisher(opts: { enabled: boolean; appendError?: Error }) {
  const order: string[] = [];
  const eventBus = {
    publishAll: vi.fn(() => {
      order.push('bus');
    }),
  };
  const store = {
    append: vi.fn(async () => {
      if (opts.appendError) throw opts.appendError;
      order.push('append');
    }),
  };
  const configService = {
    getEventStoreConfig: () => ({ enabled: opts.enabled }),
  };
  const publisher = new DefaultDomainEventPublisher(
    eventBus as never,
    store as never,
    configService as never,
  );
  return { publisher, eventBus, store, order };
}

describe('DefaultDomainEventPublisher (ES first slice · dual-mode seam)', () => {
  it('disabled: pure pass-through to the in-process bus, store never touched', async () => {
    const { publisher, eventBus, store, order } = makePublisher({ enabled: false });
    const events = [makeEvent()];
    await publisher.publishAll(events);
    expect(store.append).not.toHaveBeenCalled();
    expect(eventBus.publishAll).toHaveBeenCalledWith(events);
    expect(order).toEqual(['bus']);
  });

  it('enabled: durable append strictly BEFORE in-process publish', async () => {
    const { publisher, eventBus, store, order } = makePublisher({ enabled: true });
    const events = [makeEvent()];
    await publisher.publishAll(events);
    expect(store.append).toHaveBeenCalledWith(events);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['append', 'bus']);
  });

  it('append failure propagates fail-loud and the bus is NOT reached (宁缺勿错发)', async () => {
    const { publisher, eventBus, order } = makePublisher({
      enabled: true,
      appendError: new Error('duplicate key'),
    });
    await expect(publisher.publishAll([makeEvent()])).rejects.toThrow('duplicate key');
    expect(eventBus.publishAll).not.toHaveBeenCalled();
    expect(order).toEqual([]);
  });

  it('empty batch touches nothing', async () => {
    const { publisher, eventBus, store } = makePublisher({ enabled: true });
    await publisher.publishAll([]);
    expect(store.append).not.toHaveBeenCalled();
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });
});
