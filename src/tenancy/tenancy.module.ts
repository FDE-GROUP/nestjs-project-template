import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TenantStatusService } from './lifecycle/tenant-status.service';
import { UserStatusService } from './lifecycle/user-status.service';
import { PlatformAuditService } from './platform/platform-audit.service';
import { PlatformOperatorGuard } from './platform/platform-operator.guard';
import { QuotaGuard } from './quota/quota.guard';
import { QuotaService } from './quota/quota.service';
import { TenantPermissionGuard } from './rbac/tenant-permission.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantScopeGuard } from './tenant-scope.guard';

/**
 * Multi-tenancy能力模块（global-tenancy S0/S1/S2/S3/S4 · 混合复用骨架）。
 * Exposes `TenantContextService` globally, binds the per-request tenant scope via
 * `TenantMiddleware` (AsyncLocalStorage), and provides per-route guards:
 * - `TenantPermissionGuard` (S1 · FR-4): tenant RBAC, delegates to Better Auth ac.
 * - `TenantScopeGuard` (S2 · FR-5): fail-closed gate requiring an active tenant.
 * - `PlatformOperatorGuard` (S4 · FR-11/13): platform-level (cross-tenant) actions.
 * - `PlatformAuditService` (S5 · FR-6): structured audit choke-point for governance actions.
 * - `UserStatusService` (S6 · FR-10): platform-level user suspension deny-list (dedicated table).
 * - `QuotaService` + `QuotaGuard` (S7 · FR-7): tenant seat-quota choke-point (subscription
 *   limit vs live member count); opt-in per-route via `@Quota`, not a global APP_GUARD.
 * Row-level filtering is enforced in each aggregate's repository adapter (single
 * choke-point, 禁散点); promoting these guards to a global APP_GUARD is a separate
 * signed decision (高危#4).
 */
@Global()
@Module({
  providers: [
    TenantContextService,
    TenantStatusService,
    UserStatusService,
    TenantPermissionGuard,
    TenantScopeGuard,
    PlatformOperatorGuard,
    PlatformAuditService,
    QuotaService,
    QuotaGuard,
  ],
  exports: [
    TenantContextService,
    TenantStatusService,
    UserStatusService,
    TenantPermissionGuard,
    TenantScopeGuard,
    PlatformOperatorGuard,
    PlatformAuditService,
    QuotaService,
    QuotaGuard,
  ],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
