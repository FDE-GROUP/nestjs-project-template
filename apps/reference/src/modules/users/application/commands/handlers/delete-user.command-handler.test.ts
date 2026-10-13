import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserRepository } from '../../../domain/repositories/user.repository';
import { DeleteUserCommand } from '../delete-user.command';
import { DeleteUserCommandHandler } from './delete-user.command-handler';

describe('DeleteUserCommandHandler (PIPL right-to-erase · C1)', () => {
  const findById = vi.fn();
  const remove = vi.fn();
  const repo = { findById, remove } as unknown as UserRepository;
  let handler: DeleteUserCommandHandler;

  beforeEach(() => {
    findById.mockReset();
    remove.mockReset();
    handler = new DeleteUserCommandHandler(repo);
  });

  it('removes the user when it exists', async () => {
    findById.mockResolvedValue({ id: 'u1' } as never);
    remove.mockResolvedValue(undefined);

    await expect(handler.execute(new DeleteUserCommand('u1'))).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledWith('u1');
    expect(remove).toHaveBeenCalledWith('u1');
  });

  it('throws NotFound and does NOT delete when user missing', async () => {
    findById.mockResolvedValue(null);
    await expect(handler.execute(new DeleteUserCommand('ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
