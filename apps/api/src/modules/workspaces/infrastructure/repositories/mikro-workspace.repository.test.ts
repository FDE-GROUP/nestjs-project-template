import { Workspace } from '@app/database/mikro/four-tables';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroWorkspaceRepository } from './mikro-workspace.repository';

/**
 * 切片 3c-ii-A 双轨**镜像断言**：与 `原工作区仓储镜像测试` 同一套隔离律（S3 · FR-5 卡点），
 * 只是把旧 ORM 谓词对象换成 Mikro `FilterQuery` 平面对象。fake `em` 由 `MikroOrmService.fork()` 供给——
 * 关键不变量：`requireTenantId()` fail-closed **先于** `fork()`（无租户→403 且绝不取 em/查库）。
 */
function makeRepo(tenantId: string | null) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId } as unknown as TenantContextService;

  const findAndCount = vi.fn().mockResolvedValue([[], 0]);
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const nativeDelete = vi.fn().mockResolvedValue(0);
  const em = {
    findAndCount,
    findOne,
    create,
    persist,
    flush,
    nativeDelete,
  } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;

  return {
    repo: new MikroWorkspaceRepository(mikro, tenant),
    spies: { requireTenantId, fork, findAndCount, findOne, create, persist, flush, nativeDelete },
  };
}

describe('MikroWorkspaceRepository · tenant isolation (S3 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: every method refuses and never forks an em when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list({ limit: 20, offset: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.create({ name: 'n', slug: 's' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.update('w1', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(repo.remove('w1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.findAndCount).not.toHaveBeenCalled();
    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });

  it('list() ALWAYS filters by the active tenant (red if the organizationId is dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 10, offset: 5 });
    expect(spies.findAndCount).toHaveBeenCalledTimes(1);
    const [entity, where, options] = spies.findAndCount.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(Workspace);
    expect(where).toEqual({ organizationId: 'orgA' });
    expect(options).toMatchObject({
      limit: 10,
      offset: 5,
      orderBy: { createdAt: QueryOrder.ASC },
    });
  });

  it('list() returns the Page<T> envelope via createPage (治理面同形)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const entities = [
      { id: 'w1', name: 'A', slug: 'a', organizationId: 'orgA', createdAt, updatedAt },
    ];
    spies.findAndCount.mockResolvedValueOnce([entities, 42]);

    const page = await repo.list({ limit: 10, offset: 5 });

    expect(page).toEqual({
      items: [{ id: 'w1', name: 'A', slug: 'a', organizationId: 'orgA', createdAt, updatedAt }],
      total: 42,
      limit: 10,
      offset: 5,
    });
  });

  it('create() stamps the active tenant regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ name: 'Design', slug: 'design' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.organizationId).toBe('orgA');
    expect(spies.persist).toHaveBeenCalled();
    expect(spies.flush).toHaveBeenCalled();
  });

  it('update() scopes by BOTH id and tenant → foreign id resolves null → returns null', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.findOne.mockResolvedValue(null);
    const result = await repo.update('w1', { name: 'Renamed' });
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'w1', organizationId: 'orgA' });
    expect(result).toBeNull();
  });

  it('update() with a real row mutates within-tenant and stamps updatedAt', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    spies.findOne.mockResolvedValue({
      id: 'w1',
      name: 'A',
      slug: 'a',
      organizationId: 'orgA',
      createdAt,
      updatedAt,
    });
    const result = await repo.update('w1', { name: 'Renamed' });
    expect(result).toMatchObject({ id: 'w1', name: 'Renamed', organizationId: 'orgA' });
    expect(spies.flush).toHaveBeenCalled();
  });

  it('update() with an empty draft does not flush (no timestamp bump)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    spies.findOne.mockResolvedValue({
      id: 'w1',
      name: 'A',
      slug: 'a',
      organizationId: 'orgA',
      createdAt,
      updatedAt,
    });
    const result = await repo.update('w1', {});
    expect(result).toMatchObject({ id: 'w1', name: 'A' });
    expect(spies.flush).not.toHaveBeenCalled();
  });

  it('remove() scopes by BOTH id and tenant', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.nativeDelete.mockResolvedValueOnce(1);
    const ok = await repo.remove('w1');
    const [, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'w1', organizationId: 'orgA' });
    expect(ok).toBe(true);
  });

  it('remove() returns false when the row is not in the active tenant (0 affected)', async () => {
    const { repo, spies } = makeRepo('orgA');
    spies.nativeDelete.mockResolvedValueOnce(0);
    expect(await repo.remove('foreign')).toBe(false);
  });
});
