import type { DrizzleService } from '@app/database/drizzle.service';
import { post } from '@app/database/schema';
import type { TenantContextService } from '@core/tenancy/tenant-context.service';
import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzlePostRepository } from './drizzle-post.repository';

function makeRepo(tenantId: string | null, workspaceId?: string) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId, workspaceId } as unknown as TenantContextService;

  const findMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn().mockResolvedValue(null);
  const returning = vi.fn();
  const values = vi.fn((_v: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn((_t: unknown) => ({ values }));
  const db = {
    query: { post: { findMany, findFirst } },
    insert,
  } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;

  return {
    repo: new DrizzlePostRepository(drizzle, tenant),
    spies: { requireTenantId, findMany, findFirst, insert, values, returning },
  };
}

describe('DrizzlePostRepository · tenant isolation (S2 · FR-5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: list() refuses and never queries when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list()).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.findMany).not.toHaveBeenCalled();
  });

  it('list() ALWAYS filters by the active tenant (red if the where clause is dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list();
    expect(spies.findMany).toHaveBeenCalledTimes(1);
    const options = spies.findMany.mock.calls[0][0] as { where: unknown };
    // Structural equality with the exact predicate the adapter must build: drop `where`
    // (undefined) or filter by the wrong column/value and this goes red.
    expect(options.where).toEqual(eq(post.organizationId, 'orgA'));
  });

  it('findById() scopes by BOTH id and tenant (no cross-tenant id leak)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.findById('p1');
    const options = spies.findFirst.mock.calls[0][0] as { where: unknown };
    expect(options.where).toEqual(and(eq(post.id, 'p1'), eq(post.organizationId, 'orgA')));
  });

  it('create() stamps the active tenant regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.returning.mockResolvedValue([{ id: 'p1', organizationId: 'orgA' }]);
    await repo.create({ title: 'hi' });
    const inserted = spies.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.organizationId).toBe('orgA');
  });

  it('create() refuses when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.create({ title: 'hi' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.insert).not.toHaveBeenCalled();
  });
});

describe('DrizzlePostRepository · compound workspace scope (S3 · D2/§8-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() with an active workspace adds the workspaceId narrowing to the tenant filter', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.list();
    const options = spies.findMany.mock.calls[0][0] as { where: unknown };
    // Must be the compound predicate: drop the workspace clause and this goes red.
    expect(options.where).toEqual(
      and(eq(post.organizationId, 'orgA'), eq(post.workspaceId, 'wsA1')),
    );
  });

  it('list() without a workspace selector stays tenant-scoped (no workspace clause)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list();
    const options = spies.findMany.mock.calls[0][0] as { where: unknown };
    expect(options.where).toEqual(eq(post.organizationId, 'orgA'));
  });

  it('findById() with a workspace scopes by id + tenant + workspace (互不可见)', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.findById('p1');
    const options = spies.findFirst.mock.calls[0][0] as { where: unknown };
    expect(options.where).toEqual(
      and(eq(post.id, 'p1'), eq(post.organizationId, 'orgA'), eq(post.workspaceId, 'wsA1')),
    );
  });

  it('create() stamps BOTH the trusted tenant and the active workspace', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    spies.returning.mockResolvedValue([{ id: 'p1', organizationId: 'orgA', workspaceId: 'wsA1' }]);
    await repo.create({ title: 'hi' });
    const inserted = spies.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.organizationId).toBe('orgA');
    expect(inserted.workspaceId).toBe('wsA1');
  });

  it('create() with no workspace selector stamps workspaceId = null (tenant-level row)', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.returning.mockResolvedValue([{ id: 'p1', organizationId: 'orgA', workspaceId: null }]);
    await repo.create({ title: 'hi' });
    const inserted = spies.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.organizationId).toBe('orgA');
    expect(inserted.workspaceId).toBeNull();
  });
});
