import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersController } from './api/users.controller';
import { CreateUserCommandHandler } from './application/commands/handlers/create-user.command-handler';
import { GetUserQueryHandler } from './application/queries/handlers/get-user.query-handler';
import { GetUsersQueryHandler } from './application/queries/handlers/get-users.query-handler';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { UserRegisteredEventHandler } from './infrastructure/dispatchers/user-domain-events.dispatcher';
import { DrizzleUserRepository } from './infrastructure/repositories/drizzle-user.repository';

const CommandHandlers = [CreateUserCommandHandler];
const QueryHandlers = [GetUsersQueryHandler, GetUserQueryHandler];
const EventHandlers = [UserRegisteredEventHandler];

@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    ...EventHandlers,
    // Dependency inversion: domain owns the port, infrastructure provides the adapter.
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
  ],
  exports: [],
})
export class UsersModule {}
