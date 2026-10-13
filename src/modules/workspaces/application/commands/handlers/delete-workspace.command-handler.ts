import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import { DeleteWorkspaceCommand } from '../delete-workspace.command';

@CommandHandler(DeleteWorkspaceCommand)
export class DeleteWorkspaceCommandHandler implements ICommandHandler<DeleteWorkspaceCommand> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(command: DeleteWorkspaceCommand): Promise<boolean> {
    return this.workspaces.remove(command.id);
  }
}
