import 'reflect-metadata';
import type { ConfigService } from '@app/config/config.service';
import { Organization } from '@app/database/mikro/entities';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import { TenantRejectedEvent } from '@core/saas-kit/tenancy/lifecycle/events/tenant-rejected.event';
import type { EventBus } from '@nestjs/cqrs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DefaultDomainEventPublisher } from './domain-event-publisher';
import { EVENT_TYPE_REGISTRY } from './event-type-registry';
import { Event } from './mikro/four-tables';
import { MikroOrmService } from './mikro/mikro-orm.service';
import { MikroEventStore } from './mikro-event-store';
import { MikroUnitOfWork } from './mikro-unit-of-work';
import { OutboxRelay } from './outbox-relay';
import { TransactionScope } from './transaction-scope';

/**
 * Outbox 同事务化 + relay 耐久投递 **真库往返**（module-es-outbox-transactional 切片 D · env-gated）。
 *
 * 坐实单测 mock 面覆盖不了的三条硬证据：
 *  1. **同生共死**：事务内业务行 + 事件行一起提交；事件 append fail-loud → 业务行**一并回滚**
 *     （dual-write 窗口消灭的直接反证）；
 *  2. relay 真 SQL 面：`FOR UPDATE SKIP LOCKED` 拉取、`dispatchedAt` 置位、版本拒收/去重重投
 *     在物理表上的最终形态；
 *  3. publisher 的 outbox 守卫：事务外 `publishAll` fail-loud。
 *
 * 总线用收集替身（派发忠实性已由 `outbox-relay.test.ts` 单测锁），本测只验投递**决定**与
 * 表内状态。仅 `E2E_DATABASE_URL` 存在且库已含 event 投递列时运行；默认 CI 跳过（DB-free 不变量）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('Outbox + relay real-DB round trip (module-es-outbox-transactional · env-gated)', () => {
  let mikro: MikroOrmService;
  let store: MikroEventStore;
  let scope: TransactionScope;
  let uow: MikroUnitOfWork;
  let published: DomainEvent[];
  let relay: OutboxRelay;
  const orgId = `e2e-outbox-org-${Date.now()}`;
  const tenantAggregateId = `e2e-outbox-tenant-${Date.now()}`;

  const makeEvent = (): TenantRejectedEvent =>
    new TenantRejectedEvent({
      aggregateId: tenantAggregateId,
      correlationId: 'corr-e2e',
      payload: { actorId: 'op-e2e' },
    });

  beforeAll(async () => {
    scope = new TransactionScope();
    mikro = new MikroOrmService({ getDatabaseConfig: () => ({ url: E2E_DB }) } as never, scope);
    store = new MikroEventStore(mikro);
    uow = new MikroUnitOfWork(mikro, scope);
    published = [];
    relay = new OutboxRelay(
      { getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 50 }) } as unknown as ConfigService,
      mikro,
      { publishAll: (batch: DomainEvent[]) => published.push(...batch) } as unknown as EventBus,
    );
  });

  afterAll(async () => {
    const em = await mikro.fork();
    await em.nativeDelete(Event, {
      aggregateType: 'tenant',
      aggregateId: tenantAggregateId,
    } as never);
    await em.nativeDelete(Organization, { id: orgId } as never);
    await (mikro as unknown as { onModuleDestroy(): Promise<void> }).onModuleDestroy();
  });

  it('同事务原子：事件 append 失败 → 同事务业务行一并回滚（dual-write 窗口消灭）', async () => {
    const first = makeEvent();
    // 先干净落一对（提交成功）
    await uow.run(async () => {
      await (await mikro.fork()).insert(Organization, {
        id: orgId,
        name: 'E2E Outbox',
        slug: orgId,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      await store.append([first]);
    });
    const probe = await mikro.fork();
    expect(await probe.count(Event, { eventId: first.eventId } as never)).toBe(1);

    // 再犯重复 eventId：事务内整段回滚——新 org 行不得存在
    const dupOrgId = `${orgId}-rollback`;
    await expect(
      uow.run(async () => {
        const em = await mikro.fork();
        await em.insert(Organization, {
          id: dupOrgId,
          name: 'E2E Outbox Rollback',
          slug: dupOrgId,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
        await store.append([makeEvent(), first]); // first 重复 → 唯一键 fail-loud
      }),
    ).rejects.toThrow();
    const after = await mikro.fork();
    expect(await after.count(Organization, { id: dupOrgId } as never)).toBe(0);
    // 原事件行未被污染（仍恰一行）
    expect(await after.count(Event, { eventId: first.eventId } as never)).toBe(1);
  });

  it('relay 投递：未派发行被 tickOnce 捞出并置 dispatchedAt，总线收到重建实例', async () => {
    const em0 = await mikro.fork();
    expect(
      await em0.count(Event, { dispatchedAt: null, aggregateId: tenantAggregateId } as never),
    ).toBe(1);
    expect(await relay.tickOnce()).toBeGreaterThanOrEqual(1);
    const lastId = await lastEventId(em0);
    expect(published.some((e) => e.eventId === lastId)).toBe(true);
    const em1 = await mikro.fork();
    const rows = await em1.find(Event, { aggregateId: tenantAggregateId } as never);
    expect(rows.every((r) => r.dispatchedAt != null)).toBe(true);
  });

  it('去重重投（at-least-once）：置位前崩溃再现未投递行 → 去重窗吞投递、只补标记', async () => {
    const em = await mikro.fork();
    const row = (await em.find(Event, { aggregateId: tenantAggregateId } as never))[0];
    // 模拟「已投递未置位即崩溃」：手工把 dispatchedAt 拨回 null
    await em.nativeUpdate(Event, { id: row.id } as never, { dispatchedAt: null } as never);
    const before = published.length;
    await expect(relay.tickOnce()).resolves.toBeGreaterThanOrEqual(1);
    expect(published.length).toBe(before); // 零新投（eventId 在去重窗内）
    const em2 = await mikro.fork();
    const after = await em2.findOne(Event, { id: row.id } as never);
    expect(after?.dispatchedAt).not.toBeNull();
  });

  it('版本拒收（裁点丁）：eventVersion 超上限行 → 行级 park 停重试、不停摆', async () => {
    const em = await mikro.fork();
    const poison = {
      eventId: `e2e-poison-${Date.now()}`,
      aggregateId: tenantAggregateId,
      aggregateType: 'tenant',
      version: 999,
      eventType: 'tenant.rejected',
      eventVersion: 99,
      payload: {},
      metadata: null,
      occurredAt: new Date(),
      createdAt: new Date(),
      attemptCount: 0,
      dispatchedAt: null,
      lastError: null,
    };
    await em.insert(Event, poison as never);
    await relay.tickOnce();
    const row = await em.findOne(Event, { eventId: poison.eventId } as never);
    expect(row?.dispatchedAt).toBeNull();
    expect(row?.attemptCount).toBe(OutboxRelay.MAX_ATTEMPTS);
    expect(row?.lastError).toBe('unsupported eventVersion 99');
    // 二次 tick 不再拉取（attemptCount<MAX 条件自然排除）
    const before = published.length;
    await relay.tickOnce();
    expect(published.length).toBe(before);
    await em.nativeDelete(Event, { eventId: poison.eventId } as never);
  });

  it('publisher outbox 守卫：事务外 publishAll fail-loud（同事务硬要求）', async () => {
    const config = { getEventPublishConfig: () => ({ mode: 'outbox', pollMs: 50 }) };
    const publisher = new DefaultDomainEventPublisher(
      { publishAll: () => {} } as unknown as EventBus,
      store,
      config as unknown as ConfigService,
      scope,
    );
    await expect(publisher.publishAll([makeEvent()])).rejects.toThrow(/unit of work/);
    // 注册表收录核对（防 e2e 与 registry 漂移）
    expect(EVENT_TYPE_REGISTRY.has('tenant.rejected')).toBe(true);
  });

  async function lastEventId(em: Awaited<ReturnType<MikroOrmService['fork']>>): Promise<string> {
    const rows = await em.find(Event, { aggregateId: tenantAggregateId } as never, {
      orderBy: { id: 'DESC' },
      limit: 1,
    });
    return rows[0]?.eventId ?? '';
  }
});
