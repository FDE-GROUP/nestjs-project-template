import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleTenantGovernanceRepository } from './drizzle-tenant-governance.repository';

/** A fluent select-chain that resolves to `rows` when awaited. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
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
  return { repo: new DrizzleTenantGovernanceRepository(drizzle), select };
}

const orgRow = {
  id: 'orgA',
  name: 'Acme',
  slug: 'acme',
  metadata: { status: 'suspended' },
  createdAt: new Date('2026-01-01'),
};

describe('DrizzleTenantGovernanceRepository (S5 · FR-6 跨租户视图)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() maps rows, coerces unrecorded status → active, and reports total', async () => {
    const { repo } = makeRepo([[{ ...orgRow, metadata: undefined }], [{ count: 7 }]]);
    const page = await repo.list({ limit: 20, offset: 0 });
    expect(page.total).toBe(7);
    expect(page.items[0]).toMatchObject({
      organizationId: 'orgA',
      name: 'Acme',
      slug: 'acme',
      status: TENANT_STATUS.ACTIVE, // 无状态存量视同 active
    });
    expect(page).toMatchObject({ limit: 20, offset: 0 });
  });

  it('list() preserves an explicit lifecycle status', async () => {
    const { repo } = makeRepo([[orgRow], [{ count: 1 }]]);
    const page = await repo.list({ limit: 10, offset: 5 });
    expect(page.items[0].status).toBe(TENANT_STATUS.SUSPENDED);
  });

  it('findById() returns null when the row is absent', async () => {
    const { repo } = makeRepo([[]]);
    await expect(repo.findById('ghost')).resolves.toBeNull();
  });

  it('diagnostics() returns null for an unknown tenant without counting', async () => {
    const { repo, select } = makeRepo([[]]);
    await expect(repo.diagnostics('ghost')).resolves.toBeNull();
    expect(select).toHaveBeenCalledTimes(1); // only the findById select ran
  });

  it('diagnostics() aggregates member/invitation/workspace/post counts', async () => {
    // findById row, then four count rows (member, invitation, workspace, post)
    const { repo } = makeRepo([
      [orgRow],
      [{ count: 3 }],
      [{ count: 1 }],
      [{ count: 2 }],
      [{ count: 9 }],
    ]);
    const diag = await repo.diagnostics('orgA');
    expect(diag).toMatchObject({
      memberCount: 3,
      invitationCount: 1,
      workspaceCount: 2,
      postCount: 9,
    });
    expect(diag?.tenant.organizationId).toBe('orgA');
  });

  it('findById() issues exactly one select and maps the row', async () => {
    const { repo, select } = makeRepo([[orgRow]]);
    const row = await repo.findById('orgA');
    expect(select).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ organizationId: 'orgA', status: TENANT_STATUS.SUSPENDED });
  });

  it('list() builds the search predicate over name/slug', async () => {
    const { repo } = makeRepo([[], [{ count: 0 }]]);
    // just ensure it does not throw and returns an empty page for a search
    const page = await repo.list({ limit: 20, offset: 0, search: 'acme' });
    expect(page.items).toEqual([]);
  });
});
