import { randomUUID } from 'node:crypto';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '@core/shared-kernel/domain/event-publisher.port';
import { ConflictException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcryptjs';
import { type PublicUser, User } from '../../../domain/entities/user.aggregate';
import { USER_REPOSITORY, type UserRepository } from '../../../domain/repositories/user.repository';
import { CreateUserCommand } from '../create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand, PublicUser> {
  private readonly logger = new Logger(CreateUserCommandHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: CreateUserCommand): Promise<PublicUser> {
    const existing = await this.users.findByEmail(command.email);
    if (existing) {
      this.logger.warn(`User with email ${command.email} already exists`);
      throw new ConflictException(`User with email ${command.email} already exists`);
    }

    const passwordHash = await bcrypt.hash(command.password, 10);
    const user = User.register({
      id: randomUUID(),
      email: command.email,
      passwordHash,
      firstName: command.firstName ?? null,
      lastName: command.lastName ?? null,
    });

    const persisted = await this.users.save(user);

    // ES 首切片：派发收口到 DOMAIN_EVENT_PUBLISHER（event store 启用则先耐久 append，
    // 再进程内 publishAll）；pull/emit 接缝形态不变（roadmap Phase B 写路径切换只动实现）。
    await this.events.publishAll(persisted.pullDomainEvents());

    this.logger.log(`User created successfully with ID: ${persisted.id}`);
    return persisted.toPublicProjection();
  }
}
