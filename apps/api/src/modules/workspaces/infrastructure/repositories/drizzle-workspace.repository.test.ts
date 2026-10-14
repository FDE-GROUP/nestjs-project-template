import type { DrizzleService } from '@app/database/drizzle.service';
import { workspace } from '@app/database/schema';
import type { TenantContextService } from '@core/tenancy/tenant-context.service';
import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleWorkspaceRepository } from './drizzle-workspace.repository';

function makeRepo(tenantId: string | null) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId } as unknown as TenantContextService;

  const findMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn().mockResolvedValue(null);

  // count 链：db.select(...).from(table).where(...) → [{ count }]
  const countWhere = vi.fn((_w: unknown) => Promise.resolve([{ count: 0 }]));
  const countFrom = vi.fn((_t: unknown) => ({ where: countWhere }));
  const select = vi.fn((_c: unknown) => ({ from: countFrom }));

  const insertReturning = vi.fn().mockResolvedValue([{ id: 'w1', organizationId: tenantId }]);
  const values = vi.fn((_v: Record<string, unknown>) => ({ returning: insertReturning }));
  const insert = vi.fn((_t: unknown) => ({ values }));

  const updateReturning = vi.fn().mockResolvedValue([]);
  const whereUpdate = vi.fn((_w: unknown) => ({ returning: updateReturning }));
  const set = vi.fn((_s: unknown) => ({ where: whereUpdate }));
  const update = vi.fn((_t: unknown) => ({ set }));

  const deleteReturning = vi.fn().mockResolvedValue([]);
  const whereDelete = vi.fn((_w: unknown) => ({ returning: deleteReturning }));
  const del = vi.fn((_t: unknown) => ({ where: whereDelete }));

  const db = {
    query: { workspace: { findMany, findFirst } },
    insert,
    update,
    delete: del,
    select,
  } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;

  return {
    repo: new DrizzleWorkspaceRepository(drizzle, tenant),
    spies: {
      requireTenantId,
      findMany,
      findFirst,
      insert,
      values,
      update,
      set,
      whereUpdate,
      updateReturning,
      del,
      whereDelete,
      deleteReturning,
      select,
      countFrom,
      countWhere,
    },
  };
}

describe('DrizzleWorkspaceRepository · tenant isolation (S3 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: every method refuses and never queries when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list({ limit: 20, offset: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.create({ name: 'n', slug: 's' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.update('w1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.remove('w1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.findMany).not.toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.del).not.toHaveBeenCalled();
  });

  it('list() ALWAYS filters by the active tenant (red if the where clause is dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 10, offset: 5 });
    const options = spies.findMany.mock.calls[0][0] as {
      where: unknown;
      limit: number;
      offset: number;
    };
    expect(options.where).toEqual(eq(workspace.organizationId, 'orgA'));
    // 分页参数必须下传（丢了就是无界读回归）
    expect(options.limit).toBe(10);
    expect(options.offset).toBe(5);
    // count 第二发同样带租户 where
    expect(spies.countWhere.mock.calls[0][0]).toEqual(eq(workspace.organizationId, 'orgA'));
  });

  it('list() returns the Page<T> envelope via createPage (治理面同形)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const rows = [{ id: 'w1', name: 'A', organizationId: 'orgA' }];
    spies.findMany.mockResolvedValueOnce(rows);
    spies.countWhere.mockResolvedValueOnce([{ count: 42 }]);

    const page = await repo.list({ limit: 10, offset: 5 });

    expect(page).toEqual({
      items: rows,
      total: 42,
      limit: 10,
      offset: 5,
    });
    // items 浅复制：信封不复用 rows 引用
    expect(page.items).not.toBe(rows);
  });

  it('create() stamps the active tenant regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ name: 'Design', slug: 'design' });
    const inserted = spies.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.organizationId).toBe('orgA');
  });

  it('update() scopes by BOTH id and tenant → foreign id matches 0 rows → null', async () => {
    const { repo, spies } = makeRepo('orgA');
    const result = await repo.update('w1', { name: 'Renamed' });
    const whereArg = spies.whereUpdate.mock.calls[0][0];
    expect(whereArg).toEqual(and(eq(workspace.id, 'w1'), eq(workspace.organizationId, 'orgA')));
    expect(result).toBeNull();
  });

  it('update() with a real row returns it', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.updateReturning.mockResolvedValue([
      { id: 'w1', organizationId: 'orgA', name: 'Renamed' },
    ]);
    const result = await repo.update('w1', { name: 'Renamed' });
    expect(result).toMatchObject({ id: 'w1', name: 'Renamed' });
  });

  it('remove() scopes by BOTH id and tenant', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.remove('w1');
    const whereArg = spies.whereDelete.mock.calls[0][0];
    expect(whereArg).toEqual(and(eq(workspace.id, 'w1'), eq(workspace.organizationId, 'orgA')));
  });

  it('remove() returns false when the row is not in the active tenant', async () => {
    const { repo } = makeRepo('orgA');
    expect(await repo.remove('foreign')).toBe(false);
  });
});
