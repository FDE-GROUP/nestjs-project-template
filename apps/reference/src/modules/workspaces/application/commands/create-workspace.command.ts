import { BaseCommand } from '@core/shared-kernel/cqrs/types';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/**
 * Write-side intent to create a tenant-owned workspace. Carries primitives only; the owning
 * tenant is NOT a field — it is stamped from the trusted context by the repository.
 */
export class CreateWorkspaceCommand extends BaseCommand<WorkspaceReadModel> {
  constructor(
    readonly name: string,
    readonly slug: string,
  ) {
    super();
  }
}
