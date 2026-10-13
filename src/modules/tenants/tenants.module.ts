import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TenantsController } from './api/tenants.controller';
import { ApproveTenantCommandHandler } from './application/commands/handlers/approve-tenant.command-handler';
import { RejectTenantCommandHandler } from './application/commands/handlers/reject-tenant.command-handler';
import { SubmitTenantApplicationCommandHandler } from './application/commands/handlers/submit-tenant-application.command-handler';
import { TENANT_PROVISIONING_REPOSITORY } from './domain/repositories/tenant-provisioning.repository';
import { DrizzleTenantProvisioningRepository } from './infrastructure/repositories/drizzle-tenant-provisioning.repository';

const CommandHandlers = [
  SubmitTenantApplicationCommandHandler,
  ApproveTenantCommandHandler,
  RejectTenantCommandHandler,
];

/**
 * Tenant lifecycle slice (global-tenancy S4 · FR-1/FR-11/FR-12). `AuthInstanceInjectKey`
 * (global via AuthModule.forRoot) and `DrizzleService` (DatabaseModule @Global) are
 * resolved without extra imports; TenantStatusService comes from the global TenancyModule.
 */
@Module({
  imports: [CqrsModule],
  controllers: [TenantsController],
  providers: [
    ...CommandHandlers,
    // Dependency inversion: domain owns the gateway port, infrastructure calls Better Auth.
    { provide: TENANT_PROVISIONING_REPOSITORY, useClass: DrizzleTenantProvisioningRepository },
  ],
  exports: [],
})
export class TenantsModule {}
