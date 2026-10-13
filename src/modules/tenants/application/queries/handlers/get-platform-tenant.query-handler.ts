import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import type { PlatformTenantRow } from '../../read-models/platform-tenant.read-model';
import { GetPlatformTenantQuery } from '../get-platform-tenant.query';

/** Tenant detail (FR-6 · platform-level read side). */
@QueryHandler(GetPlatformTenantQuery)
export class GetPlatformTenantQueryHandler implements IQueryHandler<GetPlatformTenantQuery> {
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetPlatformTenantQuery): Promise<PlatformTenantRow | null> {
    return this.governance.findById(query.organizationId);
  }
}
