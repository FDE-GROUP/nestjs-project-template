import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UserRegisteredEvent } from '@app/modules/users/domain/events/user-registered.event';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/tenancy/lifecycle/events/tenant-status-transitioned.event';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DrizzleService } from './drizzle.service';
import { MikroOrmService } from './mikro/mikro-orm.service';
import { MikroEventStore } from './mikro-event-store';
import { event } from './schema';

/**
 * ORM 修宪案 B · 切片 3c-ii-C —— MikroEventStore **真库往返**（env-gated·沿 event-store.append.e2e 惯例）。
 *
 * 现默认 CI 的 `event-store.append.e2e.test.ts` 直接手工 `new DrizzleEventStore`（系 ES 首切片既有面·
 * 非生产装配）；本片把 `EVENT_STORE` 绑定改指 `MikroEventStore`，故补此测坐实**影子追加语义在 Mikro 轨下
 * 逐字节等价**——信封→列忠实、`version` 按流 max+1 递增、重复 `eventId`/唯一键 fail-loud、
 * `deleteByAggregate` PIPL 级联补删返条数。断言读回仍走 Drizzle（同物理 `event` 表·交叉验证非自证）。
 *
 * 仅当 `E2E_DATABASE_URL` 存在且目标库**已含 event 表（0009）**时运行；默认 CI 跳过、不触库（DB-free 不变量）。
 * Mikro 侧仅 `em.insert`/`nativeDelete` 写读、**不建表不迁移**（迁移实体与运行时实体分职·恒等闸正交）。
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

gated('MikroEventStore real-DB round trip (ORM 修宪案 B · 切片 3c-ii-C · env-gated)', () => {
  let drizzle: DrizzleService;
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  const aggregateIds: string[] = [];

  beforeAll(async () => {
    drizzle = new DrizzleService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never);
    await drizzle.onModuleInit();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never);
    store = new MikroEventStore(mikro);
  });

  afterAll(async () => {
    if (aggregateIds.length > 0) {
      await drizzle.db.delete(event).where(inArray(event.aggregateId, aggregateIds));
    }
    await mikro.onModuleDestroy();
    await drizzle.onModuleDestroy();
  });

  it('persists the envelope faithfully and increments version per stream', async () => {
    const aggregateId = `es-mikro-${Date.now()}`;
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
    const aggregateId = `es-mikro-dup-${Date.now()}`;
    aggregateIds.push(aggregateId);
    const duplicate = makeRegistrationEvent(aggregateId);
    await store.append([duplicate]);
    await expect(store.append([duplicate])).rejects.toThrow();
  });

  it('tenant stream increments per stream and purges via deleteByAggregate（PIPL §3.2）', async () => {
    const orgId = `es-mikro-tenant-${Date.now()}`;
    aggregateIds.push(orgId);
    await store.append([
      new TenantStatusTransitionedEvent({
        aggregateId: orgId,
        payload: { from: 'pending_approval', to: 'active', actorId: 'op-1' },
      }),
    ]);
    await store.append([
      new TenantStatusTransitionedEvent({
        aggregateId: orgId,
        payload: { from: 'active', to: 'suspended', actorId: 'op-2', reason: 'abuse' },
      }),
    ]);

    const rows = await drizzle.db
      .select()
      .from(event)
      .where(eq(event.aggregateId, orgId))
      .orderBy(event.version);
    expect(rows.map((row) => row.version)).toEqual([1, 2]);
    expect(rows[0].aggregateType).toBe('tenant');

    // PIPL 级联补删真库归零：nativeDelete 返删除条数，再查余 0 行
    await expect(store.deleteByAggregate('tenant', orgId)).resolves.toBe(2);
    const remaining = await drizzle.db.select().from(event).where(eq(event.aggregateId, orgId));
    expect(remaining).toHaveLength(0);
  });

  it('deleteByAggregate only purges the target aggregate (scoped, not global)', async () => {
    const victim = `es-mikro-piplt-${Date.now()}`;
    const bystander = `es-mikro-bystander-${Date.now()}`;
    aggregateIds.push(victim, bystander);
    await store.append([makeRegistrationEvent(victim), makeRegistrationEvent(bystander)]);

    await expect(store.deleteByAggregate('user', victim)).resolves.toBe(1);
    const left = await drizzle.db.select().from(event).where(eq(event.aggregateId, bystander));
    expect(left).toHaveLength(1);
  });
});
