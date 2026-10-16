import { User as UserEntity } from '@app/database/mikro/entities';
import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../domain/entities/user.aggregate';
import { MikroUserRepository } from './mikro-user.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d1）双轨**镜像断言**：与 `原用户仓储镜像测试` 逐例对齐的
 * 非弱化断言，仅把旧 ORM 的 insert/update/delete/findFirst 换成 Mikro
 * `em.create+persist+flush` / `em.assign+flush` / `em.nativeDelete` / `em.findOne`。fake `em` 经
 * `MikroOrmService.fork()` 供给——每操作取独立 em（禁共享全局 em）。`user` 属 users 上下文，
 * 本类写自身 owned 表 → 表所有权写侧纪律天然合规（无跨上下文写）。
 */
function makeRepo() {
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((_entity: unknown, data: Record<string, unknown>) => data);
  const flush = vi.fn().mockResolvedValue(undefined);
  const persist = vi.fn(() => ({ flush }));
  const assign = vi.fn((entity: Record<string, unknown>, data: Record<string, unknown>) =>
    Object.assign(entity, data),
  );
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const em = { findOne, create, persist, flush, assign, nativeDelete } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    repo: new MikroUserRepository(mikro),
    spies: { fork, findOne, create, persist, flush, assign, nativeDelete },
  };
}

const entityRow = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'USER',
  password: 'hashed',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

describe('MikroUserRepository (S-d1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('save(new) inserts via create+persist+flush, marks existing, and reflects timestamps', async () => {
    const { repo, spies } = makeRepo();
    const user = User.register({
      id: 'u-1',
      email: 'ada@example.com',
      passwordHash: 'hashed',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(user.isNew).toBe(true);

    const saved = await repo.save(user);

    expect(spies.fork).toHaveBeenCalledTimes(1);
    expect(spies.create).toHaveBeenCalledTimes(1);
    const [entity, data] = spies.create.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(UserEntity);
    expect(data).toMatchObject({
      id: 'u-1',
      email: 'ada@example.com',
      role: 'USER',
      name: 'Ada Lovelace',
    });
    expect(spies.persist).toHaveBeenCalledTimes(1);
    expect(spies.flush).toHaveBeenCalledTimes(1);
    expect(spies.assign).not.toHaveBeenCalled();
    expect(saved).toBe(user);
    expect(saved.isNew).toBe(false);
    // 新建显式盖 now（无 DB 触发器）·落回聚合的 createdAt/updatedAt 均为有效 Date。
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('save(existing) updates via findOne+assign+flush (never inserts)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    const user = User.rehydrate({
      id: 'u-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'USER',
      passwordHash: 'hashed',
      createdAt: entityRow.createdAt,
      updatedAt: entityRow.updatedAt,
    });
    user.rename('Ada', 'Byron');

    const saved = await repo.save(user);

    expect(spies.create).not.toHaveBeenCalled();
    expect(spies.persist).not.toHaveBeenCalled();
    expect(spies.findOne).toHaveBeenCalledTimes(1);
    expect(spies.findOne.mock.calls[0][0]).toBe(UserEntity);
    expect(spies.findOne.mock.calls[0][1]).toEqual({ id: 'u-1' });
    expect(spies.assign).toHaveBeenCalledTimes(1);
    expect(spies.flush).toHaveBeenCalledTimes(1);
    expect(saved).toBe(user);
    // createdAt 取回实体原值（保留），updatedAt 新盖为有效 Date。
    expect(saved.createdAt).toEqual(entityRow.createdAt);
    expect(saved.updatedAt).toBeInstanceOf(Date);
  });

  it('save(existing) fails loud when the row is absent (镜像旧语义 update…returning 缺行崩溃语义·不静默新建)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce(null);
    const user = User.rehydrate({
      id: 'ghost',
      email: 'g@x.c',
      firstName: null,
      lastName: null,
      role: 'USER',
      passwordHash: 'h',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(repo.save(user)).rejects.toThrow(/not found for update/);
    expect(spies.create).not.toHaveBeenCalled();
  });

  it('findByEmail rehydrates an aggregate from findOne (mapped state, no leak of new flag)', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    const user = await repo.findByEmail('ada@example.com');

    expect(user).toBeInstanceOf(User);
    expect(user?.email).toBe('ada@example.com');
    expect(user?.passwordHash).toBe('hashed');
    expect(user?.role).toBe('USER');
    expect(user?.isNew).toBe(false);
    expect(spies.findOne.mock.calls[0][1]).toEqual({ email: 'ada@example.com' });
  });

  it('findById rehydrates by id and returns null when no row matches', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({ ...entityRow });
    const found = await repo.findById('u-1');
    expect(found).toBeInstanceOf(User);
    expect(spies.findOne.mock.calls[0][1]).toEqual({ id: 'u-1' });

    spies.findOne.mockResolvedValueOnce(null);
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('entityToState maps nullable columns: firstName/lastName ?? null, password ?? "", updatedAt falls back to createdAt', async () => {
    const { repo, spies } = makeRepo();
    spies.findOne.mockResolvedValueOnce({
      id: 'u-2',
      name: 'Bob',
      email: 'bob@x.c',
      firstName: null,
      lastName: null,
      role: null,
      password: null,
      emailVerified: false,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      updatedAt: null,
    });
    const user = await repo.findById('u-2');
    expect(user?.firstName).toBeNull();
    expect(user?.lastName).toBeNull();
    expect(user?.passwordHash).toBe('');
    expect(user?.role).toBe('USER'); // role 兜底 'USER'
    expect(user?.updatedAt).toEqual(new Date('2026-03-01T00:00:00.000Z')); // updatedAt 兜底 createdAt
  });

  it('remove issues a single nativeDelete (pure SQL·FK cascade·R-B3 同律·never em.remove)', async () => {
    const { repo, spies } = makeRepo();
    await repo.remove('u-1');
    expect(spies.nativeDelete).toHaveBeenCalledTimes(1);
    const [entity, where] = spies.nativeDelete.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(entity).toBe(UserEntity);
    expect(where).toEqual({ id: 'u-1' });
    expect(spies.fork).toHaveBeenCalledTimes(1);
  });
});
