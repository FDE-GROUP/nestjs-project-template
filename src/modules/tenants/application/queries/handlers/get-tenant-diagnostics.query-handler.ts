import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import type { TenantDiagnostics } from '../../read-models/platform-tenant.read-model';
import { GetTenantDiagnosticsQuery } from '../get-tenant-diagnostics.query';

/** Per-tenant diagnostics (FR-6 · platform-level read side). */
@QueryHandler(GetTenantDiagnosticsQuery)
export class GetTenantDiagnosticsQueryHandler implements IQueryHandler<GetTenantDiagnosticsQuery> {
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetTenantDiagnosticsQuery): Promise<TenantDiagnostics | null> {
    return this.governance.diagnostics(query.organizationId);
  }
}
