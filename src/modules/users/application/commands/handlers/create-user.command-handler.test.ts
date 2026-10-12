import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User, type UserState } from '../../../domain/entities/user.aggregate';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { CreateUserCommand } from '../create-user.command';
import { CreateUserCommandHandler } from './create-user.command-handler';

vi.mock('bcryptjs', () => ({
  hash: vi.fn(async () => 'hashed-secret'),
}));

const persistedState = (over: Partial<UserState> = {}): UserState => ({
  id: 'fixed-id',
  email: 'new@example.com',
  firstName: null,
  lastName: null,
  role: 'USER',
  passwordHash: 'hashed-secret',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

describe('CreateUserCommandHandler', () => {
  const publishAll = vi.fn();
  const eventBus = { publishAll } as never;

  let repo: UserRepository & {
    findByEmail: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  const makeRepo = (): typeof repo =>
    ({
      findByEmail: vi.fn(async () => null),
      findById: vi.fn(async () => null),
      // Mirrors DrizzleUserRepository's new-record path: persist, attach DB timestamps,
      // and return the SAME aggregate instance so its recorded events survive to pull.
      save: vi.fn(async (u: User) => {
        u.attachPersistenceMetadata(
          new Date('2026-01-01T00:00:00.000Z'),
          new Date('2026-01-01T00:00:00.000Z'),
        );
        u.markExisting();
        return u;
      }),
      remove: vi.fn(async () => {}),
    }) as unknown as typeof repo;

  beforeEach(() => {
    publishAll.mockReset();
    repo = makeRepo();
  });

  it('rejects when a user with the email already exists', async () => {
    repo.findByEmail.mockResolvedValueOnce(User.rehydrate(persistedState()));
    const handler = new CreateUserCommandHandler(repo as unknown as UserRepository, eventBus);

    await expect(
      handler.execute(new CreateUserCommand('new@example.com', 'password123')),
    ).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
    expect(publishAll).not.toHaveBeenCalled();
  });

  it('persists, dispatches user.registered, and returns the public projection', async () => {
    const handler = new CreateUserCommandHandler(repo as unknown as UserRepository, eventBus);

    const result = await handler.execute(
      new CreateUserCommand('new@example.com', 'password123', 'Ada', 'Lovelace'),
    );

    expect(repo.findByEmail).toHaveBeenCalledWith('new@example.com');
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      email: 'new@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'USER',
    });
    expect(result).not.toHaveProperty('passwordHash');

    expect(publishAll).toHaveBeenCalledTimes(1);
    const dispatched = publishAll.mock.calls[0][0] as { eventType: string }[];
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].eventType).toBe('user.registered');
  });

  it('defaults optional names to null', async () => {
    const handler = new CreateUserCommandHandler(repo as unknown as UserRepository, eventBus);
    const result = await handler.execute(new CreateUserCommand('solo@example.com', 'password123'));
    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeNull();
  });
});
