import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersController } from './api/users.controller';
import { DeleteUserCommandHandler } from './application/commands/handlers/delete-user.command-handler';
import { ExportUserDataQueryHandler } from './application/queries/handlers/export-user-data.query-handler';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { UserRegisteredEventHandler } from './infrastructure/dispatchers/user-domain-events.dispatcher';
import { DrizzleUserRepository } from './infrastructure/repositories/drizzle-user.repository';

// 暴露面收紧（module-users-surface-reduction）：Create/GetUser(s) handler 随端点删除；
// domain/infrastructure 契约面（port/adapter/聚合/事件）按 §2.2 全保留。
const CommandHandlers = [DeleteUserCommandHandler];
const QueryHandlers = [ExportUserDataQueryHandler];
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
