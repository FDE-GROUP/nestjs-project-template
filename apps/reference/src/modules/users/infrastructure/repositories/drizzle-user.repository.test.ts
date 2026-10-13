import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../domain/entities/user.aggregate';
import { DrizzleUserRepository } from './drizzle-user.repository';

const dbRow = {
  id: 'u-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'USER',
  password: 'hashed',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const makeReturningInsert = vi.fn();
const makeInsertValues = vi.fn();
const makeUpdateReturning = vi.fn();
const makeUpdateSet = vi.fn();
const makeUpdateWhere = vi.fn();
const makeDeleteWhere = vi.fn();
const findFirst = vi.fn();

const db = {
  insert: vi.fn(() => {
    makeInsertValues.mockImplementation(() => ({
      returning: makeReturningInsert.mockResolvedValue([dbRow]),
    }));
    return { values: makeInsertValues };
  }),
  update: vi.fn(() => {
    makeUpdateSet.mockImplementation(() => ({
      where: makeUpdateWhere.mockImplementation(() => ({
        returning: makeUpdateReturning.mockResolvedValue([dbRow]),
      })),
    }));
    return { set: makeUpdateSet };
  }),
  delete: vi.fn(() => ({ where: makeDeleteWhere.mockResolvedValue([]) })),
  query: { user: { findFirst, findMany: vi.fn() } },
};

describe('DrizzleUserRepository', () => {
  let repo: DrizzleUserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new DrizzleUserRepository({ db } as never);
  });

  it('inserts a new aggregate and returns the same instance as persisted', async () => {
    const user = User.register({
      id: 'u-1',
      email: 'ada@example.com',
      passwordHash: 'hashed',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(user.isNew).toBe(true);

    const saved = await repo.save(user);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(makeInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-1', email: 'ada@example.com', role: 'USER' }),
    );
    expect(saved).toBe(user);
    expect(saved.isNew).toBe(false);
    expect(saved.updatedAt).toEqual(dbRow.updatedAt);
  });

  it('updates an existing aggregate instead of inserting', async () => {
    const user = User.rehydrate({
      id: 'u-1',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'USER',
      passwordHash: 'hashed',
      createdAt: dbRow.createdAt,
      updatedAt: dbRow.updatedAt,
    });
    user.rename('Ada', 'Byron');

    const saved = await repo.save(user);

    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(saved).toBe(user);
  });

  it('rehydrates an aggregate from findFirst', async () => {
    findFirst.mockResolvedValueOnce(dbRow);
    const user = await repo.findByEmail('ada@example.com');

    expect(user).toBeInstanceOf(User);
    expect(user?.email).toBe('ada@example.com');
    expect(user?.passwordHash).toBe('hashed');
    expect(user?.isNew).toBe(false);
  });

  it('returns null when no row matches', async () => {
    findFirst.mockResolvedValueOnce(null);
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('issues a delete on remove', async () => {
    await repo.remove('u-1');
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(makeDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
