import { CreateWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/create-workspace.command-handler';
import { DeleteWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/delete-workspace.command-handler';
import { UpdateWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/update-workspace.command-handler';
import { ListWorkspacesQueryHandler } from '@core/saas-kit/modules/workspaces/application/queries/handlers/list-workspaces.query-handler';
import { WORKSPACE_REPOSITORY } from '@core/saas-kit/modules/workspaces/domain/repositories/workspace.repository';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { WorkspacesController } from './api/workspaces.controller';
import { MikroWorkspaceRepository } from './infrastructure/repositories/mikro-workspace.repository';

const CommandHandlers = [
  CreateWorkspaceCommandHandler,
  UpdateWorkspaceCommandHandler,
  DeleteWorkspaceCommandHandler,
];
const QueryHandlers = [ListWorkspacesQueryHandler];

@Module({
  imports: [CqrsModule],
  controllers: [WorkspacesController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the port, infrastructure enforces tenant scope.
    // ORM 修宪案 B · 切片 3c-ii-A：绑定改指 Mikro 适配（`DrizzleWorkspaceRepository` 不删·双轨回滚点）。
    { provide: WORKSPACE_REPOSITORY, useClass: MikroWorkspaceRepository },
  ],
  exports: [],
})
export class WorkspacesModule {}
