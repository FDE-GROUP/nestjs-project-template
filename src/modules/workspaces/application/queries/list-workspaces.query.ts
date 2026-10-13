import { BaseQuery } from '@app/shared-kernel/cqrs/types';
import type { WorkspaceReadModel } from '../read-models/workspace.read-model';

/** List workspaces within the active tenant (no tenant arg — scope is enforced downstream). */
export class ListWorkspacesQuery extends BaseQuery<WorkspaceReadModel[]> {}
