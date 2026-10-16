import { Organization, User } from '@app/database/mikro/entities';
import { Post } from '@app/database/mikro/post.entity';
import type { EntityManager } from '@mikro-orm/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createPosts, createUsers, runSeed } from './seed';

/**
 * ORM 修宪案 B · 切片 4-α（S-d6）——seed 数据面 Drizzle→Mikro 换轨的**镜像断言**（非弱化）。
 * 用假 `em`（`findOne/insert/nativeUpdate/nativeDelete/find`）直调导出的 `createUsers/createPosts/
 * cleanup/runSeed`，逐例钉：① 操作形态（findFirst→findOne·insert→em.insert·update→nativeUpdate·
 * delete→nativeDelete）；② **保真红线**——insert 载荷**不含 createdAt/emailVerified**（靠 DB 默认填充），
 * 但**必含 updatedAt**（真库 `user/post.updatedAt` NOT NULL 无 DB 默认·须显式写）；③ role 文本；
 * ④ cleanup 删序 post→user（FK 依赖）；⑤ `SEED_CLEANUP` 门控；⑥ runSeed 编排次序 cleanup→createUsers→createPosts。
 * 入口守卫确保 import 本模块不触发 `main()` 建连。
 */
function makeEm() {
  const findOne = vi.fn().mockResolvedValue(null);
  const insert = vi.fn().mockResolvedValue({});
  const nativeUpdate = vi.fn().mockResolvedValue(1);
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const find = vi.fn().mockResolvedValue([]);
  const em = { findOne, insert, nativeUpdate, nativeDelete, find } as unknown as EntityManager;
  return { em, spies: { findOne, insert, nativeUpdate, nativeDelete, find } };
}

/** 取针对某实体的 insert 调用（区分 User / Post）。 */
function insertsFor(insert: ReturnType<typeof vi.fn>, entity: unknown) {
  return insert.mock.calls.filter(([e]) => e === entity).map(([, d]) => d);
}

const ENV_KEYS = [
  'PLATFORM_OPERATOR_EMAIL',
  'ADMIN_PASSWORD',
  'USER_PASSWORD',
  'SEED_CLEANUP',
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  vi.stubEnv('PLATFORM_OPERATOR_EMAIL', 'op@example.com');
  vi.stubEnv('ADMIN_PASSWORD', 'secret-admin');
  vi.stubEnv('USER_PASSWORD', 'secret-user');
  vi.stubEnv('SEED_CLEANUP', '');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('seed createUsers (S-d6)', () => {
  it('operator 不存在 → em.insert(User, {role:"ADMIN",updatedAt}) 单条·不写时间戳 createdAt/emailVerified（落 DB 默认）', async () => {
    const { em, spies } = makeEm();
    spies.findOne.mockResolvedValueOnce(null);

    await createUsers(em, { includeTestData: false, userCount: 1, postCount: 0 });

    expect(spies.findOne).toHaveBeenCalledTimes(1);
    expect(spies.findOne.mock.calls[0][0]).toBe(User);
    expect(spies.findOne.mock.calls[0][1]).toEqual({ email: 'op@example.com' });
    expect(spies.nativeUpdate).not.toHaveBeenCalled();

    const userInserts = insertsFor(spies.insert, User);
    expect(userInserts).toHaveLength(1);
    const payload = userInserts[0] as Record<string, unknown>;
    expect(payload.email).toBe('op@example.com');
    expect(payload.role).toBe('ADMIN');
    expect(typeof payload.password).toBe('string');
    expect(payload.password).not.toBe('secret-admin'); // bcrypt 已散列
    // 保真红线：createdAt/emailVerified 交由 DB 默认（对齐旧 Drizzle insert）；updatedAt NOT NULL 无默认须显式。
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('emailVerified');
    expect(payload.updatedAt).toBeInstanceOf(Date);
    expect(payload.id).toMatch(/^[0-9a-f-]{36}$/); // randomUUID
  });

  it('operator 已存在 → em.nativeUpdate(User,{email},{role:"ADMIN",updatedAt:Date})·不 insert 主账号', async () => {
    const { em, spies } = makeEm();
    spies.findOne.mockResolvedValueOnce({ id: 'x', email: 'op@example.com' });

    await createUsers(em, { includeTestData: false, userCount: 1, postCount: 0 });

    expect(spies.insert).not.toHaveBeenCalled();
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    const [entity, where, set] = spies.nativeUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(entity).toBe(User);
    expect(where).toEqual({ email: 'op@example.com' });
    expect(set.role).toBe('ADMIN');
    expect(set.updatedAt).toBeInstanceOf(Date); // 镜像旧 Drizzle $onUpdate 自动 bump
    expect(typeof set.password).toBe('string');
  });

  it('includeTestData & userCount>1 → 批量 em.insert(User, [...]) 每人 role:"USER"', async () => {
    const { em, spies } = makeEm();
    spies.findOne.mockResolvedValueOnce({ id: 'x', email: 'op@example.com' }); // 走 update 路径·不掺主账号 insert

    await createUsers(em, { includeTestData: true, userCount: 3, postCount: 0 });

    const userInserts = insertsFor(spies.insert, User);
    expect(userInserts).toHaveLength(1);
    const batch = userInserts[0] as (Record<string, unknown> & { role: string })[];
    expect(batch).toHaveLength(2); // i = 1,2
    expect(batch.every((u) => u.role === 'USER')).toBe(true);
    expect(batch.every((u) => !('createdAt' in u))).toBe(true);
    expect(batch.every((u) => u.updatedAt instanceof Date)).toBe(true);
  });
});

describe('seed createPosts (S-d6)', () => {
  it('无 organization → 跳过·不 insert post', async () => {
    const { em, spies } = makeEm();
    spies.find.mockResolvedValueOnce([]);

    await createPosts(em, { includeTestData: true, userCount: 0, postCount: 3 });

    expect(spies.find).toHaveBeenCalledTimes(1);
    expect(spies.find.mock.calls[0][0]).toBe(Organization);
    expect(spies.find.mock.calls[0][1]).toEqual({});
    expect(spies.find.mock.calls[0][2]).toEqual({ limit: 1 });
    expect(insertsFor(spies.insert, Post)).toHaveLength(0);
  });

  it('有 organization → 每 post 盖 organizationId·显式 updatedAt·不写 createdAt（落 DB 默认）', async () => {
    const { em, spies } = makeEm();
    spies.find.mockResolvedValueOnce([{ id: 'org-1' }]);

    await createPosts(em, { includeTestData: true, userCount: 0, postCount: 2 });

    const postInserts = insertsFor(spies.insert, Post);
    expect(postInserts).toHaveLength(1);
    const batch = postInserts[0] as (Record<string, unknown> & { organizationId: string })[];
    expect(batch).toHaveLength(2);
    expect(batch.every((p) => p.organizationId === 'org-1')).toBe(true);
    expect(batch.every((p) => !('createdAt' in p))).toBe(true);
    expect(batch.every((p) => p.updatedAt instanceof Date)).toBe(true);
  });

  it('includeTestData=false → 早退·不查 organization', async () => {
    const { em, spies } = makeEm();
    await createPosts(em, { includeTestData: false, userCount: 0, postCount: 3 });
    expect(spies.find).not.toHaveBeenCalled();
    expect(spies.insert).not.toHaveBeenCalled();
  });
});

describe('seed cleanup (S-d6)', () => {
  it('SEED_CLEANUP=true → 全表 nativeDelete 且删序 post→user（FK 依赖）', async () => {
    vi.stubEnv('SEED_CLEANUP', 'true');
    const { em, spies } = makeEm();

    await cleanup(em);

    expect(spies.nativeDelete).toHaveBeenCalledTimes(2);
    expect(spies.nativeDelete.mock.calls[0][0]).toBe(Post);
    expect(spies.nativeDelete.mock.calls[0][1]).toEqual({});
    expect(spies.nativeDelete.mock.calls[1][0]).toBe(User);
    expect(spies.nativeDelete.mock.calls[1][1]).toEqual({});
  });

  it('SEED_CLEANUP≠true → 不删', async () => {
    vi.stubEnv('SEED_CLEANUP', 'false');
    const { em, spies } = makeEm();
    await cleanup(em);
    expect(spies.nativeDelete).not.toHaveBeenCalled();
  });
});

describe('seed runSeed 编排 (S-d6)', () => {
  it('按 cleanup → createUsers → createPosts 次序用同一 em', async () => {
    vi.stubEnv('SEED_CLEANUP', 'true');
    const { em, spies } = makeEm();
    spies.findOne.mockResolvedValueOnce({ id: 'x', email: 'op@example.com' });
    spies.find.mockResolvedValueOnce([{ id: 'org-1' }]);

    await runSeed(em, { includeTestData: true, userCount: 1, postCount: 1 });

    // cleanup 的两条 nativeDelete 必先于任何 insert（编排次序钉死）。
    const order = [
      ...spies.nativeDelete.mock.calls.map(() => 'delete'),
      ...spies.insert.mock.calls.map(() => 'insert'),
    ];
    expect(order[0]).toBe('delete');
    // createUsers（nativeUpdate·operator 存在）与 createPosts（insert Post）均发生。
    expect(spies.nativeUpdate).toHaveBeenCalledTimes(1);
    expect(insertsFor(spies.insert, Post)).toHaveLength(1);
  });
});
