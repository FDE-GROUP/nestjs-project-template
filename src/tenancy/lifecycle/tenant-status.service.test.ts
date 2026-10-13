import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantStatusService } from './tenant-status.service';

/** select().from().where().limit() → resolves `rows` when awaited. */
function selectChain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    limit: () => c,
  };
  // Bracket assignment (not an object-literal `then` key) mimics drizzle's awaitable builder.
  c['then'] = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res);
  return c;
}

function makeService(metadata: unknown) {
  const set = vi.fn((_s: unknown) => ({ where: vi.fn(() => Promise.resolve()) }));
  const update = vi.fn((_t: unknown) => ({ set }));
  const select = vi.fn(() => selectChain(metadata === undefined ? [] : [{ metadata }]));
  const db = { select, update } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return { svc: new TenantStatusService(drizzle), select, update, set };
}

describe('TenantStatusService.transition (S5 · §9.4 严格迁移单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes back metadata and returns ok with the previous status', async () => {
    const { svc, update, set } = makeService({ status: 'pending_approval', plan: 'pro' });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'ok',
      previous: TENANT_STATUS.PENDING,
      status: TENANT_STATUS.ACTIVE,
    });
    expect(update).toHaveBeenCalledTimes(1);
    // preserved unrelated metadata key + new status
    const patch = set.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(patch.metadata).toEqual({ plan: 'pro', status: 'active' });
  });

  it('returns not-found when the row is absent', async () => {
    const { svc, update } = makeService(undefined);
    const result = await svc.transition('ghost', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({ kind: 'not-found' });
    expect(update).not.toHaveBeenCalled();
  });

  it('returns illegal without writing when the edge is disallowed', async () => {
    const { svc, update } = makeService({ status: 'deleted' });
    const result = await svc.transition('orgA', TENANT_STATUS.ACTIVE);
    expect(result).toEqual({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(update).not.toHaveBeenCalled();
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
