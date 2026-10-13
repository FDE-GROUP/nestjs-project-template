import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PlatformTenantsController } from './api/platform-tenants.controller';
import { TenantsController } from './api/tenants.controller';
import { ApproveTenantCommandHandler } from './application/commands/handlers/approve-tenant.command-handler';
import { DeleteTenantCommandHandler } from './application/commands/handlers/delete-tenant.command-handler';
import { RejectTenantCommandHandler } from './application/commands/handlers/reject-tenant.command-handler';
import { ResumeTenantCommandHandler } from './application/commands/handlers/resume-tenant.command-handler';
import { SubmitTenantApplicationCommandHandler } from './application/commands/handlers/submit-tenant-application.command-handler';
import { SuspendTenantCommandHandler } from './application/commands/handlers/suspend-tenant.command-handler';
import { GetPlatformTenantQueryHandler } from './application/queries/handlers/get-platform-tenant.query-handler';
import { GetTenantDiagnosticsQueryHandler } from './application/queries/handlers/get-tenant-diagnostics.query-handler';
import { ListPlatformTenantsQueryHandler } from './application/queries/handlers/list-platform-tenants.query-handler';
import { TENANT_GOVERNANCE_REPOSITORY } from './domain/repositories/tenant-governance.repository';
import { TENANT_PROVISIONING_REPOSITORY } from './domain/repositories/tenant-provisioning.repository';
import { DrizzleTenantGovernanceRepository } from './infrastructure/repositories/drizzle-tenant-governance.repository';
import { DrizzleTenantProvisioningRepository } from './infrastructure/repositories/drizzle-tenant-provisioning.repository';

const CommandHandlers = [
  SubmitTenantApplicationCommandHandler,
  ApproveTenantCommandHandler,
  RejectTenantCommandHandler,
  SuspendTenantCommandHandler,
  ResumeTenantCommandHandler,
  DeleteTenantCommandHandler,
];

const QueryHandlers = [
  ListPlatformTenantsQueryHandler,
  GetPlatformTenantQueryHandler,
  GetTenantDiagnosticsQueryHandler,
];

/**
 * Tenant lifecycle slice (global-tenancy S4 · FR-1/FR-11/FR-12). `AuthInstanceInjectKey`
 * (global via AuthModule.forRoot) and `DrizzleService` (DatabaseModule @Global) are
 * resolved without extra imports; TenantStatusService comes from the global TenancyModule.
 */
@Module({
  imports: [CqrsModule],
  controllers: [TenantsController, PlatformTenantsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the gateway port, infrastructure calls Better Auth.
    { provide: TENANT_PROVISIONING_REPOSITORY, useClass: DrizzleTenantProvisioningRepository },
    // S5 governance: platform-level cross-tenant read model (no tenant filter).
    { provide: TENANT_GOVERNANCE_REPOSITORY, useClass: DrizzleTenantGovernanceRepository },
  ],
  exports: [],
})
export class TenantsModule {}
