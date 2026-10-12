import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import * as bcrypt from 'bcryptjs';
import { type PublicUser, User } from '../../../domain/entities/user.aggregate';
import { USER_REPOSITORY, type UserRepository } from '../../../domain/repositories/user.repository';
import { CreateUserCommand } from '../create-user.command';

@CommandHandler(CreateUserCommand)
export class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand, PublicUser> {
  private readonly logger = new Logger(CreateUserCommandHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(EventBus) private readonly eventBus: EventBus,
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

    // In-process dispatch only for now. The ES phase swaps this for an append to the
    // event store; the pull/emit seam stays identical.
    const events = persisted.pullDomainEvents();
    if (events.length > 0) {
      this.eventBus.publishAll(events);
    }

    this.logger.log(`User created successfully with ID: ${persisted.id}`);
    return persisted.toPublicProjection();
  }
}
