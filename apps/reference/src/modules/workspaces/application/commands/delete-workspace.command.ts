import { BaseCommand } from '@app/shared-kernel/cqrs/types';

/** Delete a workspace within the active tenant (repository scopes by trusted tenant id). */
export class DeleteWorkspaceCommand extends BaseCommand<boolean> {
  constructor(readonly id: string) {
    super();
  }
}
