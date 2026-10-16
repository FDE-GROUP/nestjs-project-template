import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PlatformTenantsController } from './api/platform-tenants.controller';
import { PlatformUsersController } from './api/platform-users.controller';
import { TenantsController } from './api/tenants.controller';
import { ApproveTenantCommandHandler } from './application/commands/handlers/approve-tenant.command-handler';
import { DeleteTenantCommandHandler } from './application/commands/handlers/delete-tenant.command-handler';
import { DeleteTenantPermanentlyCommandHandler } from './application/commands/handlers/delete-tenant-permanently.command-handler';
import { RejectTenantCommandHandler } from './application/commands/handlers/reject-tenant.command-handler';
import { ResumeTenantCommandHandler } from './application/commands/handlers/resume-tenant.command-handler';
import { ResumeUserCommandHandler } from './application/commands/handlers/resume-user.command-handler';
import { SubmitTenantApplicationCommandHandler } from './application/commands/handlers/submit-tenant-application.command-handler';
import { SuspendTenantCommandHandler } from './application/commands/handlers/suspend-tenant.command-handler';
import { SuspendUserCommandHandler } from './application/commands/handlers/suspend-user.command-handler';
import { ExportTenantDataQueryHandler } from './application/queries/handlers/export-tenant-data.query-handler';
import { GetPlatformTenantQueryHandler } from './application/queries/handlers/get-platform-tenant.query-handler';
import { GetTenantDiagnosticsQueryHandler } from './application/queries/handlers/get-tenant-diagnostics.query-handler';
import { ListPlatformTenantsQueryHandler } from './application/queries/handlers/list-platform-tenants.query-handler';
import { ListPlatformUsersQueryHandler } from './application/queries/handlers/list-platform-users.query-handler';
import { TENANT_GOVERNANCE_REPOSITORY } from './domain/repositories/tenant-governance.repository';
import { TENANT_PROVISIONING_REPOSITORY } from './domain/repositories/tenant-provisioning.repository';
import { USER_GOVERNANCE_REPOSITORY } from './domain/repositories/user-governance.repository';
import { MikroTenantGovernanceRepository } from './infrastructure/repositories/mikro-tenant-governance.repository';
import { MikroTenantProvisioningRepository } from './infrastructure/repositories/mikro-tenant-provisioning.repository';
import { MikroUserGovernanceRepository } from './infrastructure/repositories/mikro-user-governance.repository';

const CommandHandlers = [
  SubmitTenantApplicationCommandHandler,
  ApproveTenantCommandHandler,
  RejectTenantCommandHandler,
  SuspendTenantCommandHandler,
  ResumeTenantCommandHandler,
  DeleteTenantCommandHandler,
  DeleteTenantPermanentlyCommandHandler,
  SuspendUserCommandHandler,
  ResumeUserCommandHandler,
];

const QueryHandlers = [
  ListPlatformTenantsQueryHandler,
  GetPlatformTenantQueryHandler,
  GetTenantDiagnosticsQueryHandler,
  ExportTenantDataQueryHandler,
  ListPlatformUsersQueryHandler,
];

/**
 * Tenant lifecycle slice (global-tenancy S4 · FR-1/FR-11/FR-12). `AuthInstanceInjectKey`
 * (global via AuthModule.forRoot) and `原数据库服务` (DatabaseModule @Global) are
 * resolved without extra imports; TenantStatusService comes from the global TenancyModule.
 */
@Module({
  imports: [CqrsModule],
  controllers: [TenantsController, PlatformTenantsController, PlatformUsersController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the gateway port, infrastructure calls Better Auth.
    // ORM 修宪案 B · 切片 3d（S-d2）：provisioning gateway 改指 MikroTenantProvisioningRepository
    // （MikroORM 为唯一实现；`submit` 仍走 BA
    // createOrganization 系统动作·仅 `remove` 落 Mikro nativeDelete）。
    { provide: TENANT_PROVISIONING_REPOSITORY, useClass: MikroTenantProvisioningRepository },
    // S5 governance: platform-level cross-tenant read model (no tenant filter).
    // ORM 修宪案 B · 切片 3c-ii-B：治理读面整片切 Mikro（MikroORM 为唯一实现）。
    { provide: TENANT_GOVERNANCE_REPOSITORY, useClass: MikroTenantGovernanceRepository },
    // S6 user governance: platform-level cross-user read model (no tenant filter)。
    { provide: USER_GOVERNANCE_REPOSITORY, useClass: MikroUserGovernanceRepository },
  ],
  exports: [],
})
export class TenantsModule {}
