import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Post } from '@app/database/mikro/post.entity';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import type { EntityManager } from '@mikro-orm/core';
import { QueryOrder } from '@mikro-orm/core';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroPostRepository } from './mikro-post.repository';

/**
 * 切片 2 双轨**镜像断言**：与 `drizzle-post.repository.test.ts` 同一套隔离律（S2 FR-5 / S3 D2·§8-6），
 * 只是把 Drizzle 谓词对象换成 Mikro `FilterQuery` 平面对象。fake `em` 由 `MikroOrmService.fork()` 供给——
 * 关键不变量：`requireTenantId()` fail-closed **先于** `fork()`（无租户→403 且绝不取 em/查库）。
 */
function makeRepo(tenantId: string | null, workspaceId?: string) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId, workspaceId } as unknown as TenantContextService;

  const findAndCount = vi.fn().mockResolvedValue([[], 0]);
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const em = { findAndCount, findOne, create, persist } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;

  return {
    repo: new MikroPostRepository(mikro, tenant),
    spies: { requireTenantId, fork, findAndCount, findOne, create, persist, flush },
  };
}

describe('MikroPostRepository · tenant isolation (S2 · FR-5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: list() refuses and never forks an em when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.list({ limit: 20, offset: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
    expect(spies.findAndCount).not.toHaveBeenCalled();
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
    expect(entity).toBe(Post);
    expect(where).toEqual({ organizationId: 'orgA' });
    expect(options).toMatchObject({
      limit: 10,
      offset: 5,
      orderBy: { createdAt: QueryOrder.DESC },
    });
  });

  it('findById() scopes by BOTH id and tenant (no cross-tenant id leak)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.findById('p1');
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'p1', organizationId: 'orgA' });
  });

  it('create() stamps the active tenant regardless of the draft', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ title: 'hi' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.organizationId).toBe('orgA');
    expect(spies.persist).toHaveBeenCalled();
    expect(spies.flush).toHaveBeenCalled();
  });

  it('create() refuses when no tenant is bound (never forks)', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.create({ title: 'hi' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.fork).not.toHaveBeenCalled();
  });
});

describe('MikroPostRepository · compound workspace scope (S3 · D2/§8-6)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list() with an active workspace narrows the tenant filter by workspaceId', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.list({ limit: 20, offset: 0 });
    const [, where] = spies.findAndCount.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ organizationId: 'orgA', workspaceId: 'wsA1' });
  });

  it('list() without a workspace selector stays tenant-scoped (no workspace clause)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.list({ limit: 20, offset: 0 });
    const [, where] = spies.findAndCount.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ organizationId: 'orgA' });
  });

  it('list() returns the Page<T> envelope via createPage (治理面同形)', async () => {
    const { repo, spies } = makeRepo('orgA');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const updatedAt = new Date('2026-01-02T00:00:00.000Z');
    const entities = [
      {
        id: 'p1',
        title: 'T',
        content: null,
        published: false,
        organizationId: 'orgA',
        workspaceId: null,
        createdAt,
        updatedAt,
      },
    ];
    spies.findAndCount.mockResolvedValueOnce([entities, 7]);

    const page = await repo.list({ limit: 3, offset: 6 });

    expect(page.total).toBe(7);
    expect(page.limit).toBe(3);
    expect(page.offset).toBe(6);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      id: 'p1',
      title: 'T',
      content: null,
      published: false,
      organizationId: 'orgA',
      workspaceId: null,
      createdAt,
      updatedAt,
    });
  });

  it('findById() with a workspace scopes by id + tenant + workspace (互不可见)', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.findById('p1');
    const [, where] = spies.findOne.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(where).toEqual({ id: 'p1', organizationId: 'orgA', workspaceId: 'wsA1' });
  });

  it('create() stamps BOTH the trusted tenant and the active workspace', async () => {
    const { repo, spies } = makeRepo('orgA', 'wsA1');
    await repo.create({ title: 'hi' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.organizationId).toBe('orgA');
    expect(data.workspaceId).toBe('wsA1');
  });

  it('create() with no workspace selector stamps workspaceId = null (tenant-level row)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ title: 'hi' });
    const data = spies.create.mock.calls[0][1] as Record<string, unknown>;
    expect(data.organizationId).toBe('orgA');
    expect(data.workspaceId).toBeNull();
  });
});
