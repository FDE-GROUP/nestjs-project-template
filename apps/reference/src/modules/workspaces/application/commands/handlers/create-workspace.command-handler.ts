import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { CreateWorkspaceCommand } from '../create-workspace.command';

@CommandHandler(CreateWorkspaceCommand)
export class CreateWorkspaceCommandHandler implements ICommandHandler<CreateWorkspaceCommand> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  async execute(command: CreateWorkspaceCommand): Promise<WorkspaceReadModel> {
    return this.workspaces.create({ name: command.name, slug: command.slug });
  }
}
