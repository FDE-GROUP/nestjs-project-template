import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { UpdateWorkspaceCommand } from '../update-workspace.command';

@CommandHandler(UpdateWorkspaceCommand)
export class UpdateWorkspaceCommandHandler implements ICommandHandler<UpdateWorkspaceCommand> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(command: UpdateWorkspaceCommand): Promise<WorkspaceReadModel | null> {
    return this.workspaces.update(command.id, { name: command.name, slug: command.slug });
  }
}
