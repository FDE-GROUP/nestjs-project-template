import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import type { PlatformTenantPage } from '../../read-models/platform-tenant.read-model';
import { ListPlatformTenantsQuery } from '../list-platform-tenants.query';

/**
 * Cross-tenant list (FR-6). Deliberately tenant-agnostic: the governance repository
 * applies NO tenant filter (platform-level sees everything, FR-11①); access is gated
 * upstream by `PlatformOperatorGuard` on the controller route.
 */
@QueryHandler(ListPlatformTenantsQuery)
export class ListPlatformTenantsQueryHandler implements IQueryHandler<ListPlatformTenantsQuery> {
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPlatformTenantsQuery): Promise<PlatformTenantPage> {
    return this.governance.list({
      limit: query.limit,
      offset: query.offset,
      search: query.search,
    });
  }
}
