import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UserRegisteredEvent } from '@app/modules/users/domain/events/user-registered.event';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleService } from './drizzle.service';
import { DrizzleEventStore } from './drizzle-event-store';
import { event } from './schema';

/**
 * ES 首切片 · 真库往返（module-users-es-append §3-⑤，env-gated，沿 S9 分层 e2e 惯例）。
 *
 * 仅当 `E2E_DATABASE_URL` 存在时运行，且目标库**已 migrate 0009（event 表）**——
 * 默认 CI 跳过、不触库，保持 DB-free 不变量。断言三件事：信封→列逐字节忠实、
 * `version` 按流 max+1 递增、重复 `eventId` 唯一键 fail-loud。夹具在 afterAll 清净。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

function makeRegistrationEvent(aggregateId: string, eventId?: string): UserRegisteredEvent {
  return new UserRegisteredEvent({
    ...(eventId === undefined ? {} : { eventId }),
    aggregateId,
    payload: {
      id: aggregateId,
      email: `${aggregateId}@example.com`,
      firstName: null,
      lastName: null,
      role: 'USER',
    },
  });
}

gated('DrizzleEventStore real-DB round trip (ES first slice · env-gated)', () => {
  let drizzle: DrizzleService;
  let store: DrizzleEventStore;
  const aggregateIds: string[] = [];

  beforeAll(async () => {
    drizzle = new DrizzleService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never);
    await drizzle.onModuleInit();
    store = new DrizzleEventStore(drizzle);
  });

  afterAll(async () => {
    if (aggregateIds.length > 0) {
      await drizzle.db.delete(event).where(inArray(event.aggregateId, aggregateIds));
    }
    await drizzle.onModuleDestroy();
  });

  it('persists the envelope faithfully and increments version per stream', async () => {
    const aggregateId = `es-gated-${Date.now()}`;
    aggregateIds.push(aggregateId);
    const first = makeRegistrationEvent(aggregateId);
    await store.append([first]);
    const second = makeRegistrationEvent(aggregateId, randomUUID());
    await store.append([second]);

    const rows = await drizzle.db
      .select()
      .from(event)
      .where(eq(event.aggregateId, aggregateId))
      .orderBy(event.version);

    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0].eventId).toBe(first.eventId);
    expect(rows[0].aggregateType).toBe('user');
    expect(rows[0].eventType).toBe('user.registered');
    expect(rows[0].eventVersion).toBe(1);
    expect(rows[0].payload).toEqual(first.payload);
    expect(rows[0].occurredAt.getTime()).toBe(first.occurredAt.getTime());
  });

  it('re-appending the same eventId fails loud on the unique key', async () => {
    const aggregateId = `es-gated-dup-${Date.now()}`;
    aggregateIds.push(aggregateId);
    const duplicate = makeRegistrationEvent(aggregateId);
    await store.append([duplicate]);
    await expect(store.append([duplicate])).rejects.toThrow();
  });
});
