import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { DrizzlePlatformIdentityLookup } from './infrastructure/drizzle-platform-identity.lookup';
import { DrizzleQuotaStore } from './infrastructure/drizzle-quota.store';
import { DrizzleTenantStatusStore } from './infrastructure/drizzle-tenant-status.store';
import { DrizzleUserStatusStore } from './infrastructure/drizzle-user-status.store';
import { TenantStatusService } from './lifecycle/tenant-status.service';
import { TENANT_STATUS_STORE } from './lifecycle/tenant-status.store';
import { UserStatusService } from './lifecycle/user-status.service';
import { USER_STATUS_STORE } from './lifecycle/user-status.store';
import { PlatformAuditService } from './platform/platform-audit.service';
import { PLATFORM_IDENTITY_LOOKUP } from './platform/platform-identity.port';
import { PlatformOperatorGuard } from './platform/platform-operator.guard';
import { QuotaGuard } from './quota/quota.guard';
import { QuotaService } from './quota/quota.service';
import { QUOTA_STORE } from './quota/quota.store';
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
    // §9.5.4①B 端口倒置：core 服务经端口消费持久化，Drizzle 适配由本（参考）应用装配。
    { provide: TENANT_STATUS_STORE, useClass: DrizzleTenantStatusStore },
    { provide: USER_STATUS_STORE, useClass: DrizzleUserStatusStore },
    { provide: QUOTA_STORE, useClass: DrizzleQuotaStore },
    { provide: PLATFORM_IDENTITY_LOOKUP, useClass: DrizzlePlatformIdentityLookup },
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
    // 端口 token 随 @Global 一并导出：守卫/服务在消费模块（如 TenantsModule）就地实例化时
    // 也能解析到应用侧 Drizzle 适配（对齐原 `DrizzleService` 经 @Global DatabaseModule 全局可见）。
    TENANT_STATUS_STORE,
    USER_STATUS_STORE,
    QUOTA_STORE,
    PLATFORM_IDENTITY_LOOKUP,
  ],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
