import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleUserGovernanceRepository } from './drizzle-user-governance.repository';

/** A fluent select-chain (incl. leftJoin) that resolves to `rows` when awaited. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
    leftJoin: () => c,
    where: () => c,
    orderBy: () => c,
    limit: () => c,
    offset: () => c,
  };
  // Bracket assignment (not an object-literal `then` key) mimics drizzle's awaitable builder.
  c['then'] = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res);
  return c;
}

/** select() pops the next queued chain per call (list issues 2: rows then count). */
function makeRepo(queue: unknown[][]) {
  const select = vi.fn(() => chain(queue.shift() ?? []));
  const db = { select } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return { repo: new DrizzleUserGovernanceRepository(drizzle), select };
}

describe('DrizzleUserGovernanceRepository (S6 · FR-6/FR-10 跨平台用户视图)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() maps rows, coerces a missing status (LEFT JOIN null) → active, reports total', async () => {
    const rows = [
      {
        id: 'u1',
        name: 'Ann',
        email: 'ann@x.com',
        status: null,
        createdAt: new Date('2026-01-01'),
      },
    ];
    const { repo } = makeRepo([rows, [{ count: 12 }]]);
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(12);
    expect(page.items[0]).toMatchObject({
      userId: 'u1',
      name: 'Ann',
      email: 'ann@x.com',
      status: TENANT_STATUS.ACTIVE, // 无 user_status 记录 → active
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('list() preserves an explicit suspended status from the join', async () => {
    const rows = [
      {
        id: 'u2',
        name: 'Bob',
        email: 'bob@x.com',
        status: 'suspended',
        createdAt: new Date('2026-02-01'),
      },
    ];
    const { repo } = makeRepo([rows, [{ count: 1 }]]);
    const page = await repo.list({ limit: 10, offset: 0, search: 'bob' });
    expect(page.items[0].status).toBe(TENANT_STATUS.SUSPENDED);
  });

  it('list() issues two selects (rows then count) even without a search', async () => {
    const { repo, select } = makeRepo([[], [{ count: 0 }]]);
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(select).toHaveBeenCalledTimes(2);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});
