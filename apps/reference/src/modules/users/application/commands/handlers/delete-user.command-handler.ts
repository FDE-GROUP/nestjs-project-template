import { EVENT_STORE, type EventStore } from '@core/shared-kernel/domain/event-store.port';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { USER_REPOSITORY, type UserRepository } from '../../../domain/repositories/user.repository';
import { DeleteUserCommand } from '../delete-user.command';

@CommandHandler(DeleteUserCommand)
export class DeleteUserCommandHandler implements ICommandHandler<DeleteUserCommand, void> {
  private readonly logger = new Logger(DeleteUserCommandHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    // PIPL 级联补删（ES 第二切片 §3.2）：直注 EVENT_STORE，不受 EVENT_STORE_ENABLED 开关控制——
    // 表在就要清；失败 fail-loud（PIPL 不留残迹）。S9 教训：显式 @Inject + 值导入。
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    const existing = await this.users.findById(command.userId);
    if (!existing) {
      throw new NotFoundException(`User with ID ${command.userId} not found`);
    }
    // Hard delete (PIPL). FK cascades handle account/session; consent is set-null by schema.
    await this.users.remove(command.userId);
    // event 表无 FK（shadow append 设），该用户的全部事件行由应用层显式补删。
    const purgedEvents = await this.eventStore.deleteByAggregate('user', command.userId);
    this.logger.log(
      `Deleted user ${command.userId} (PIPL right-to-erase; purged ${purgedEvents} event rows)`,
    );
  }
}
