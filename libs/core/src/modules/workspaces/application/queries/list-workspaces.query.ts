import { BaseQuery } from '../../../../shared-kernel/cqrs/types';
import type { Page, PageRequest } from '../../../../shared-kernel/domain/pagination';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/** List workspaces within the active tenant (no tenant arg — scope is enforced downstream). */
export class ListWorkspacesQuery extends BaseQuery<Page<WorkspaceReadModel>> {
  constructor(readonly request: PageRequest) {
    super();
  }
}
