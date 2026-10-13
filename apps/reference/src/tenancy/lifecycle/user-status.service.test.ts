import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
import { USER_STATUS, UserStatusService } from '@core/tenancy/lifecycle/user-status.service';
import type { UserStatusStore } from '@core/tenancy/lifecycle/user-status.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 桩 `UserStatusStore`（§9.5.4①B 端口倒置后·服务不再感知 Drizzle/schema）。
 * `exists` 控 user 存在性；`status` 控 user_status 行状态（undefined=无行）。
 */
function makeService(opts: { exists?: boolean; status?: string } = {}) {
  const upsert = vi.fn(async (_id: string, _s: string, _r: string | null) => {});
  const userExists = vi.fn(async (_id: string) => opts.exists ?? true);
  const readStatus = vi.fn(async (_id: string) => opts.status);
  const store = { readStatus, userExists, upsert } as unknown as UserStatusStore;
  return { svc: new UserStatusService(store), upsert, userExists, readStatus };
}

describe('UserStatusService.transition (S6 · FR-10 用户暂停单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a suspended row and returns ok (missing prior row → treated active)', async () => {
    const { svc, upsert } = makeService({ exists: true, status: undefined });
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED, { reason: 'fraud' });
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: USER_STATUS.SUSPENDED,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith('u1', 'suspended', 'fraud');
  });

  it('returns not-found when the platform user does not exist', async () => {
    const { svc, upsert } = makeService({ exists: false });
    const result = await svc.transition('ghost', USER_STATUS.SUSPENDED);
    expect(result).toEqual({ kind: 'not-found' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed (deleted is terminal)', async () => {
    const { svc, upsert } = makeService({ exists: true, status: TENANT_STATUS.DELETED });
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('UserStatusService.isBlocked / read (deny-list)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks explicit suspended / deleted', async () => {
    expect(await makeService({ status: 'suspended' }).svc.isBlocked('u1')).toBe(true);
    expect(await makeService({ status: 'deleted' }).svc.isBlocked('u1')).toBe(true);
  });

  it('does not block a missing row (treated active)', async () => {
    const { svc } = makeService({ status: undefined });
    expect(await svc.isBlocked('u1')).toBe(false);
    expect(await svc.read('u1')).toBeUndefined();
  });
});
