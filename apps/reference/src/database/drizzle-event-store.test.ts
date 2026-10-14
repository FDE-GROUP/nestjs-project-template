import type { DomainEvent } from '@core/shared-kernel/domain/domain-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleEventStore } from './drizzle-event-store';

function makeEvent(over: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    aggregateId: 'user-1',
    aggregateType: 'user',
    eventType: 'user.registered',
    eventVersion: 1,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    payload: { id: 'user-1', email: 'a@example.com' },
    ...over,
  } as unknown as DomainEvent;
}

function makeDb(
  opts: { topVersion?: number | null; insertError?: Error; deleteCount?: number } = {},
) {
  const inserted: Record<string, unknown>[] = [];
  const deleted: Record<string, unknown>[] = [];
  const selectCalls: number[] = [];
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(async (row: Record<string, unknown>) => {
        if (opts.insertError) throw opts.insertError;
        inserted.push(row);
      }),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          const n = opts.deleteCount ?? 0;
          deleted.push({ n });
          return Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
        }),
      })),
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () =>
              Promise.resolve(opts.topVersion == null ? [] : [{ version: opts.topVersion }]),
          }),
        }),
      }),
    })),
  };
  return { db, inserted, deleted, selectCalls };
}

describe('DrizzleEventStore (ES first slice · shadow append adapter)', () => {
  let fixture: ReturnType<typeof makeDb>;
  let store: DrizzleEventStore;

  beforeEach(() => {
    fixture = makeDb();
    store = new DrizzleEventStore({ db: fixture.db } as never);
  });

  it('noops on an empty batch (never touches the db)', async () => {
    await store.append([]);
    expect(fixture.db.insert).not.toHaveBeenCalled();
    expect(fixture.db.select).not.toHaveBeenCalled();
  });

  it('maps the full envelope faithfully onto event columns', async () => {
    const event = makeEvent({ correlationId: 'corr-1' });
    await store.append([event]);
    expect(fixture.inserted).toHaveLength(1);
    expect(fixture.inserted[0]).toEqual({
      eventId: 'evt-1',
      aggregateId: 'user-1',
      aggregateType: 'user',
      version: 1,
      eventType: 'user.registered',
      eventVersion: 1,
      payload: { id: 'user-1', email: 'a@example.com' },
      metadata: { correlationId: 'corr-1', causationId: null },
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('derives version as max(version)+1 per stream (plan §6 audit amendment)', async () => {
    fixture = makeDb({ topVersion: 3 });
    store = new DrizzleEventStore({ db: fixture.db } as never);
    await store.append([makeEvent()]);
    expect(fixture.inserted[0].version).toBe(4);
  });

  it('appends every event of a batch (one version lookup per event)', async () => {
    await store.append([makeEvent({ eventId: 'evt-1' }), makeEvent({ eventId: 'evt-2' })]);
    expect(fixture.db.insert).toHaveBeenCalledTimes(2);
    expect(fixture.db.select).toHaveBeenCalledTimes(2);
    expect(fixture.inserted.map((row) => row.eventId)).toEqual(['evt-1', 'evt-2']);
  });

  it('propagates unique-key / db errors fail-loud (never swallows)', async () => {
    fixture = makeDb({ insertError: new Error('duplicate key event_aggregate_version_key') });
    store = new DrizzleEventStore({ db: fixture.db } as never);
    await expect(store.append([makeEvent()])).rejects.toThrow('duplicate key');
  });

  it('deleteByAggregate issues a scoped delete and returns the purged row count（PIPL §3.2）', async () => {
    fixture = makeDb({ deleteCount: 2 });
    store = new DrizzleEventStore({ db: fixture.db } as never);
    await expect(store.deleteByAggregate('user', 'user-1')).resolves.toBe(2);
    expect(fixture.db.delete).toHaveBeenCalledTimes(1);
    expect(fixture.deleted).toHaveLength(1);
  });

  it('deleteByAggregate returns 0 when the stream never existed (no error)', async () => {
    await expect(store.deleteByAggregate('user', 'ghost')).resolves.toBe(0);
  });
});
