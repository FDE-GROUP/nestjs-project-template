import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantStatusService } from './tenant-status.service';
import type { TenantStatusStore } from './tenant-status.store';

/**
 * 桩 `TenantStatusStore`（§9.5.4①B 端口倒置后·服务不再感知 Drizzle/schema）。
 * `metadata === undefined` 表示组织行不存在（load → undefined）；否则返回原始 metadata。
 */
function makeService(metadata: unknown) {
  const save = vi.fn(async (_id: string, _m: Record<string, unknown>) => {});
  const load = vi.fn(async (_id: string) => (metadata === undefined ? undefined : { metadata }));
  const store = { load, save } as unknown as TenantStatusStore;
  return { svc: new TenantStatusService(store), load, save };
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
    const { svc, save } = makeService(undefined);
    const result = await svc.transition('ghost', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(save).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed', async () => {
    const { svc, save } = makeService({ status: 'deleted' });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('treats an unrecorded status as active for the transition table', async () => {
    // existing row but no status key → treated as active → active→suspended is legal
    const { svc } = makeService({ plan: 'free' });
    const result = await svc.transition('orgA', TENANT_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: TENANT_STATUS.SUSPENDED,
    });
  });
});
