import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import type { TenantDataExport } from '../../read-models/tenant-data-export.read-model';
import { ExportTenantDataQuery } from '../export-tenant-data.query';

/** Per-tenant data export (NFR-6 · platform-level read side · S5 soft-delete 取证闭环）。 */
@QueryHandler(ExportTenantDataQuery)
export class ExportTenantDataQueryHandler implements IQueryHandler<ExportTenantDataQuery> {
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ExportTenantDataQuery): Promise<TenantDataExport | null> {
    return this.governance.exportTenantData(query.organizationId);
  }
}
