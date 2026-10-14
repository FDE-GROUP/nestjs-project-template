import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { TENANT_STATUS } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/tenancy/lifecycle/tenant-status.service';
import type { TenantStatusStore } from '@core/saas-kit/tenancy/lifecycle/tenant-status.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 桩 `TenantStatusStore`（§9.5.4①B 端口倒置后·服务不再感知 Drizzle/schema）。
 * `metadata === undefined` 表示组织行不存在（load → undefined）；否则返回原始 metadata。
 * ES 第二切片：publisher 桩捕获事件，锁「ok 才发、not-found/illegal 不发」。
 */
function makeService(metadata: unknown, publishError?: Error) {
  const save = vi.fn(async (_id: string, _m: Record<string, unknown>) => {});
  const load = vi.fn(async (_id: string) => (metadata === undefined ? undefined : { metadata }));
  const store = { load, save } as unknown as TenantStatusStore;
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (publishError) throw publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  return { svc: new TenantStatusService(store, publisher), load, save, published, publisher };
}

describe('TenantStatusService.transition (S5 · §9.4 严格迁移单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes back metadata and returns ok with the previous status', async () => {
    const { svc, save } = makeService({ status: 'pending_approval', plan: 'pro' });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'ok',
      previous: TENANT_STATUS.PENDING,
      status: TENANT_STATUS.ACTIVE,
    });
    expect(save).toHaveBeenCalledTimes(1);
    // preserved unrelated metadata key + new status（save(id, metadata) → 第二参）
    const written = save.mock.calls[0][1] as Record<string, unknown>;
    expect(written).toEqual({ plan: 'pro', status: 'active' });
  });

  it('returns not-found when the row is absent', async () => {
    const { svc, save, published } = makeService(undefined);
    const result = await svc.transition('ghost', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(save).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('returns illegal without writing when the edge is disallowed', async () => {
    const { svc, save, published } = makeService({ status: 'deleted' });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(save).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('treats an unrecorded status as active for the transition table', async () => {
    // existing row but no status key → treated as active → active→suspended is legal
    const { svc, published } = makeService({ plan: 'free' });
    const result = await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: TENANT_STATUS.SUSPENDED,
    });
    // 未记录态在事件 payload 中为 null（与 previous===undefined 同口径·§3.1）
    expect((published[0].payload as { from: unknown }).from).toBeNull();
  });
});

describe('TenantStatusService.transition 事件产出（ES 第二切片 §3.1）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publishes one faithful tenant.status.transitioned envelope after a legal transition', async () => {
    const { svc, published, publisher } = makeService({ status: 'pending_approval' });
    await svc.transition('orgA', TENANT_STATUS.ACTIVE, {
      actorId: 'op-1',
      reason: 'approved',
    });
    expect(publisher.publishAll).toHaveBeenCalledTimes(1);
    expect(published).toHaveLength(1);
    const event = published[0];
    expect(event).toMatchObject({
      aggregateType: 'tenant',
      aggregateId: 'orgA',
      eventType: 'tenant.status.transitioned',
      eventVersion: 1,
      payload: { from: 'pending_approval', to: 'active', actorId: 'op-1', reason: 'approved' },
    });
    expect(typeof event.eventId).toBe('string');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('omits absent actor/reason from the payload but still emits', async () => {
    const { svc, published } = makeService({ status: 'active' });
    await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(published[0].payload).toEqual({ from: 'active', to: 'suspended' });
  });

  it('fails loud when publishing fails after save（宁缺勿错发·错误不吞）', async () => {
    const { svc, save } = makeService({ status: 'active' }, new Error('append blew up'));
    await expect(svc.transition('orgA', TENANT_STATUS.SUSPENDED)).rejects.toThrow('append blew up');
    // 写先行、发布在后：save 已发生（非事务窗口如实呈记·§3.1）
    expect(save).toHaveBeenCalledTimes(1);
  });
});
