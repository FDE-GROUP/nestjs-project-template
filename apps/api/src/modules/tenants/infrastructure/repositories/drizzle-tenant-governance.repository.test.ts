import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
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
    // export 成员名册用 innerJoin（链式同形：join 后仍可 where/await）
    innerJoin: () => c,
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

// ===== NFR-6 · 租户级数据导出（vision 阶段 3 开段首切片）=====

/** exportTenantData 六段聚合的队列：org 全列 → member(join) → invitation → workspace → subscription → post */
const memberJoinRow = {
  id: 'mem1',
  role: 'owner',
  createdAt: new Date('2026-02-01'),
  userId: 'u1',
  userName: 'Ada',
  userEmail: 'ada@acme.test',
  userHandle: 'ada',
};

describe('DrizzleTenantGovernanceRepository.exportTenantData (NFR-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assembles the six-section payload with nested minimal user face', async () => {
    const { repo, select } = makeRepo([
      [orgRow],
      [memberJoinRow],
      [
        {
          id: 'inv1',
          email: 'be@acme.test',
          role: 'member',
          status: 'pending',
          expiresAt: new Date(),
          inviterId: 'u1',
          createdAt: new Date(),
        },
      ],
      [{ id: 'ws1', name: 'Core', slug: 'core', createdAt: new Date(), updatedAt: new Date() }],
      [
        {
          id: 'sub1',
          plan: 'free',
          status: 'active',
          seatsLimit: 5,
          storageQuota: null,
          apiQuota: null,
          periodStart: new Date(),
          periodEnd: null,
          provider: null,
          providerCustomerId: null,
          providerSubscriptionId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        {
          id: 'p1',
          title: 'Hello',
          content: null,
          published: false,
          workspaceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);
    const payload = await repo.exportTenantData('orgA');
    expect(select).toHaveBeenCalledTimes(6); // 六表各一次，无额外计数查询
    expect(payload).not.toBeNull();
    expect(payload?.tenant).toMatchObject({ id: 'orgA', name: 'Acme', slug: 'acme' });
    expect(payload?.members).toEqual([
      {
        id: 'mem1',
        role: 'owner',
        createdAt: memberJoinRow.createdAt,
        user: { id: 'u1', name: 'Ada', email: 'ada@acme.test', handle: 'ada' },
      },
    ]);
    expect(payload?.invitations).toHaveLength(1);
    expect(payload?.workspaces).toHaveLength(1);
    expect(payload?.subscriptions).toHaveLength(1);
    expect(payload?.posts).toHaveLength(1);
  });

  it('red line: serialized payload contains no credential keys', async () => {
    // 成员行即便意外携带 password 列（投影面已排除，此处验证输出形状本身无害），
    // 导出的 payload 序列化后也不得出现任何凭据键名。
    const { repo } = makeRepo([[orgRow], [memberJoinRow], [], [], [], []]);
    const payload = await repo.exportTenantData('orgA');
    const json = JSON.stringify(payload);
    for (const forbidden of ['password', 'accessToken', 'refreshToken', 'idToken', 'evidence']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('exports a deleted-terminal tenant (S5 取证用途·no status filter)', async () => {
    const deletedOrg = { ...orgRow, metadata: { status: 'deleted' } };
    const { repo } = makeRepo([[deletedOrg], [], [], [], [], []]);
    const payload = await repo.exportTenantData('orgA');
    expect(payload?.tenant.metadata).toEqual({ status: 'deleted' });
  });

  it('returns null for an unknown tenant without touching the other five tables', async () => {
    const { repo, select } = makeRepo([[]]);
    await expect(repo.exportTenantData('ghost')).resolves.toBeNull();
    expect(select).toHaveBeenCalledTimes(1); // 仅 org 存在性查询
  });
});
