import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { ListWorkspacesQuery } from '../list-workspaces.query';

/**
 * Read side goes through the repository port, which enforces the tenant scope
 * (global-tenancy §9.3 / FR-5). The handler itself is tenant-agnostic by design.
 */
@QueryHandler(ListWorkspacesQuery)
export class ListWorkspacesQueryHandler implements IQueryHandler<ListWorkspacesQuery> {
  constructor(@Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(): Promise<WorkspaceReadModel[]> {
    return this.workspaces.list();
  }
}
