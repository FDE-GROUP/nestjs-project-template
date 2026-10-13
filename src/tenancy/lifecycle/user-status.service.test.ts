import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_STATUS, UserStatusService } from './user-status.service';

/** select().from().where().limit() → resolves the queued rows when awaited. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    limit: () => c,
  };
  // Bracket assignment (not an object-literal `then` key) mimics drizzle's awaitable builder.
  c['then'] = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res);
  return c;
}

/**
 * `transition` reads twice (user existence, then user_status); `read`/`isBlocked` once.
 * A queue feeds each select call in order.
 */
function makeService(queues: unknown[][]) {
  let call = 0;
  const select = vi.fn(() => chain(queues[call++] ?? []));
  const onConflictDoUpdate = vi.fn(() => Promise.resolve());
  const values = vi.fn((_v: unknown) => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const db = { select, insert } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return { svc: new UserStatusService(drizzle), select, insert, values, onConflictDoUpdate };
}

describe('UserStatusService.transition (S6 · FR-10 用户暂停单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a suspended row and returns ok (missing prior row → treated active)', async () => {
    const { svc, insert, values } = makeService([[{ id: 'u1' }], []]);
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED, { reason: 'fraud' });
    expect(result).toEqual({
      kind: 'ok',
      previous: undefined,
      status: USER_STATUS.SUSPENDED,
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const patch = values.mock.calls[0][0] as { userId: string; status: string; reason: string };
    expect(patch).toMatchObject({ userId: 'u1', status: 'suspended', reason: 'fraud' });
  });

  it('returns not-found when the platform user does not exist', async () => {
    const { svc, insert } = makeService([[]]);
    const result = await svc.transition('ghost', USER_STATUS.SUSPENDED);
    expect(result).toEqual({ kind: 'not-found' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed (deleted is terminal)', async () => {
    const { svc, insert } = makeService([[{ id: 'u1' }], [{ status: 'deleted' }]]);
    const result = await svc.transition('u1', USER_STATUS.SUSPENDED);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('UserStatusService.isBlocked / read (deny-list)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks explicit suspended / deleted', async () => {
    expect(await makeService([[{ status: 'suspended' }]]).svc.isBlocked('u1')).toBe(true);
    expect(await makeService([[{ status: 'deleted' }]]).svc.isBlocked('u1')).toBe(true);
  });

  it('does not block a missing row (treated active)', async () => {
    const { svc } = makeService([[]]);
    expect(await svc.isBlocked('u1')).toBe(false);
    expect(await svc.read('u1')).toBeUndefined();
  });
});
