import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserReadModel } from '../application/read-models/user.read-model';
import type { PublicUser } from '../domain/entities/user.aggregate';
import type { CreateUserDto } from './dto/create-user.dto';
import { UsersController } from './users.controller';

const projection = (over: Partial<PublicUser> = {}): PublicUser => ({
  id: '1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'USER',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
});

describe('UsersController (bus-backed)', () => {
  const executeCommand = vi.fn();
  const executeQuery = vi.fn();
  const commandBus = { execute: executeCommand } as never;
  const queryBus = { execute: executeQuery } as never;

  let controller: UsersController;

  beforeEach(() => {
    executeCommand.mockReset();
    executeQuery.mockReset();
    controller = new UsersController(commandBus, queryBus);
  });

  it('POST /users dispatches a CreateUserCommand', async () => {
    const dto = {
      email: 'new@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
    } satisfies CreateUserDto;
    executeCommand.mockResolvedValue(projection({ id: '2', email: 'new@example.com' }));

    const result = await controller.create(dto);

    expect(executeCommand).toHaveBeenCalledTimes(1);
    const command = executeCommand.mock.calls[0][0];
    expect(command).toMatchObject({
      email: 'new@example.com',
      password: 'password123',
      firstName: 'New',
      lastName: 'User',
    });
    expect(result.email).toBe('new@example.com');
  });

  it('GET /users runs GetUsersQuery with the page request', async () => {
    const page = { items: [projection()] as UserReadModel[], total: 1, limit: 20, offset: 0 };
    executeQuery.mockResolvedValue(page);

    await expect(controller.findAll({ limit: 20, offset: 0 })).resolves.toEqual(page);
    expect(executeQuery).toHaveBeenCalledTimes(1);
  });

  it('GET /users/:id runs GetUserQuery and propagates NotFound', async () => {
    executeQuery.mockResolvedValue(projection());
    await expect(controller.findOne('1')).resolves.toMatchObject({ id: '1' });

    executeQuery.mockRejectedValue(new NotFoundException('User with ID 999 not found'));
    await expect(controller.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('GET /users/me/data-export dispatches ExportUserDataQuery with session user id', async () => {
    const payload = { user: { id: 'u9' }, accounts: [], sessions: [], consents: [] } as never;
    executeQuery.mockResolvedValue(payload);

    await expect(controller.exportMe({ id: 'u9', email: 'a@b.c' })).resolves.toBe(payload);
    const q = executeQuery.mock.calls[0][0];
    expect(q).toMatchObject({ userId: 'u9' });
  });

  it('DELETE /users/me dispatches DeleteUserCommand with session user id', async () => {
    executeCommand.mockResolvedValue(undefined);

    await expect(controller.deleteMe({ id: 'u9', email: 'a@b.c' })).resolves.toBeUndefined();
    const cmd = executeCommand.mock.calls[0][0];
    expect(cmd).toMatchObject({ userId: 'u9' });
  });
});
