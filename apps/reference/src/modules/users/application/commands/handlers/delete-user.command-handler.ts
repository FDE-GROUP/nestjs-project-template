import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { USER_REPOSITORY, type UserRepository } from '../../../domain/repositories/user.repository';
import { DeleteUserCommand } from '../delete-user.command';

@CommandHandler(DeleteUserCommand)
export class DeleteUserCommandHandler implements ICommandHandler<DeleteUserCommand, void> {
  private readonly logger = new Logger(DeleteUserCommandHandler.name);

  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    const existing = await this.users.findById(command.userId);
    if (!existing) {
      throw new NotFoundException(`User with ID ${command.userId} not found`);
    }
    // Hard delete (PIPL). FK cascades handle account/session; consent is set-null by schema.
    await this.users.remove(command.userId);
    this.logger.log(`Deleted user ${command.userId} (PIPL right-to-erase)`);
  }
}
