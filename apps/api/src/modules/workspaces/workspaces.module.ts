import { CreateWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/create-workspace.command-handler';
import { DeleteWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/delete-workspace.command-handler';
import { UpdateWorkspaceCommandHandler } from '@core/saas-kit/modules/workspaces/application/commands/handlers/update-workspace.command-handler';
import { ListWorkspacesQueryHandler } from '@core/saas-kit/modules/workspaces/application/queries/handlers/list-workspaces.query-handler';
import { WORKSPACE_REPOSITORY } from '@core/saas-kit/modules/workspaces/domain/repositories/workspace.repository';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { WorkspacesController } from './api/workspaces.controller';
import { DrizzleWorkspaceRepository } from './infrastructure/repositories/drizzle-workspace.repository';

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
    { provide: WORKSPACE_REPOSITORY, useClass: DrizzleWorkspaceRepository },
  ],
  exports: [],
})
export class WorkspacesModule {}
