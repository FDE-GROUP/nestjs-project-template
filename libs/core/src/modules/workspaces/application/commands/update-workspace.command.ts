import { BaseCommand } from '../../../../shared-kernel/cqrs/types';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/** Update a workspace within the active tenant (repository scopes by trusted tenant id). */
export class UpdateWorkspaceCommand extends BaseCommand<WorkspaceReadModel | null> {
  constructor(
    readonly id: string,
    readonly name?: string,
    readonly slug?: string,
  ) {
    super();
  }
}
