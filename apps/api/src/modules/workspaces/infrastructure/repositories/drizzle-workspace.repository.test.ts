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
    },
  };
}

describe('DrizzleWorkspaceRepository · tenant isolation (S3 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: every method refuses and never queries when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list()).rejects.toBeInstanceOf(ForbiddenException);
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
    await repo.list();
    const options = spies.findMany.mock.calls[0][0] as { where: unknown };
    expect(options.where).toEqual(eq(workspace.organizationId, 'orgA'));
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
