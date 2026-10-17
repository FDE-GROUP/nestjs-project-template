import { TenantStatusService } from '@core/saas-kit/tenancy/lifecycle/tenant-status.service';
import { TENANT_STATUS_STORE } from '@core/saas-kit/tenancy/lifecycle/tenant-status.store';
import { UserStatusService } from '@core/saas-kit/tenancy/lifecycle/user-status.service';
import { USER_STATUS_STORE } from '@core/saas-kit/tenancy/lifecycle/user-status.store';
import { PlatformAuditService } from '@core/saas-kit/tenancy/platform/platform-audit.service';
import { PLATFORM_SETTINGS } from '@core/saas-kit/tenancy/platform/platform-config.port';
import { PLATFORM_IDENTITY_LOOKUP } from '@core/saas-kit/tenancy/platform/platform-identity.port';
import { PlatformOperatorGuard } from '@core/saas-kit/tenancy/platform/platform-operator.guard';
import { QuotaGuard } from '@core/saas-kit/tenancy/quota/quota.guard';
import { QuotaService } from '@core/saas-kit/tenancy/quota/quota.service';
import { QUOTA_STORE } from '@core/saas-kit/tenancy/quota/quota.store';
import { SESSION_READER } from '@core/saas-kit/tenancy/session/request-session.port';
import { TenantMiddleware } from '@core/saas-kit/tenancy/tenant.middleware';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthSessionReader } from './infrastructure/auth-session.reader';
import { ConfigPlatformSettings } from './infrastructure/config-platform.settings';
import { MikroPlatformIdentityLookup } from './infrastructure/mikro-platform-identity.lookup';
import { MikroQuotaStore } from './infrastructure/mikro-quota.store';
import { MikroTenantStatusStore } from './infrastructure/mikro-tenant-status.store';
import { MikroUserStatusStore } from './infrastructure/mikro-user-status.store';

/**
 * Multi-tenancy能力模块（global-tenancy S0/S1/S2/S3/S4 · 混合复用骨架）。
 * Exposes `TenantContextService` globally, binds the per-request tenant scope via
 * `TenantMiddleware` (AsyncLocalStorage), and provides per-route guards:
 * - `TenantScopeGuard` (S2 · FR-5): fail-closed gate requiring an active tenant.
 * - `PlatformOperatorGuard` (S4 · FR-11/13): platform-level (cross-tenant) actions.
 * - `PlatformAuditService` (S5 · FR-6): structured audit choke-point for governance actions.
 * - `UserStatusService` (S6 · FR-10): platform-level user suspension deny-list (dedicated table).
 * - `QuotaService` + `QuotaGuard` (S7 · FR-7): tenant seat-quota choke-point (subscription
 *   limit vs live member count); opt-in per-route via `@Quota`, not a global APP_GUARD.
 * Row-level filtering is enforced in each aggregate's repository adapter (single
 * choke-point, 禁散点).
 *
 * S11 · 高危#4 复合全局：`TenantScopeGuard` 已升为全局 `APP_GUARD`（deny-by-default 租户墙），
 * 经 `AppModule` 中 `AuthModule`（会话墙）先于本模块解析 → 会话 401 先于租户 403。`@Public`/`@TenantExempt`
 * 显式旁路（见 `tenant-scope.guard`）。`TenantPermissionGuard`/`PlatformOperatorGuard`/`QuotaGuard`
 * 仍逐路由 opt-in（语义异质·不宜全局）。
 *
 * 领域细化重构 A3：租户 RBAC 裁决（`TenantPermissionGuard` + CASL checker 与
 * `TENANT_PERMISSION_CHECKER`/`TENANT_PERMISSION_INVALIDATOR` 端口绑定）已迁出本横切
 * 隔离层，归 `AuthorizationModule`（@Global 供给）；本模块只留隔离机制与
 * 状态/会话/配额/平台治理适配，不再依赖 TenantsModule。
 */
@Global()
@Module({
  providers: [
    TenantContextService,
    TenantStatusService,
    UserStatusService,
    TenantScopeGuard,
    PlatformOperatorGuard,
    PlatformAuditService,
    QuotaService,
    QuotaGuard,
    // §9.5.4①B 端口倒置：core 服务经端口消费持久化，适配由本（参考）应用装配。
    // ORM 修宪案 B · 切片 3c-ii-A：user_status/quota 绑定改指 Mikro 适配（MikroORM 为唯一实现）。
    { provide: TENANT_STATUS_STORE, useClass: MikroTenantStatusStore },
    { provide: USER_STATUS_STORE, useClass: MikroUserStatusStore },
    { provide: QUOTA_STORE, useClass: MikroQuotaStore },
    { provide: PLATFORM_IDENTITY_LOOKUP, useClass: MikroPlatformIdentityLookup },
    // §9.5.4①B · P1b 会话端口倒置：core 经端口消费会话/RBAC，Better Auth 实例适配由参考应用装配。
    { provide: SESSION_READER, useClass: AuthSessionReader },
    // §9.5.3 热点③ · P1c 配置端口：core 经端口消费平台配置，`ConfigService` 适配留参考应用。
    { provide: PLATFORM_SETTINGS, useClass: ConfigPlatformSettings },
    // S11 · 高危#4 复合全局：全局租户墙（deny-by-default）。TenantScopeGuard 已在本模块 provide，
    // 其依赖（TenantContextService 本地 · Reflector 由 Nest core 自动提供）均可解析；useExisting 复用同实例。
    // @Public/@TenantExempt 路由经 Reflector 旁路。注册于 AuthModule 会话墙之后（AppModule import 顺序）。
    { provide: APP_GUARD, useExisting: TenantScopeGuard },
  ],
  exports: [
    TenantContextService,
    TenantStatusService,
    UserStatusService,
    TenantScopeGuard,
    PlatformOperatorGuard,
    PlatformAuditService,
    QuotaService,
    QuotaGuard,
    // 端口 token 随 @Global 一并导出：守卫/服务在消费模块（如 TenantsModule）就地实例化时
    // 也能解析到应用侧 旧 ORM 适配（对齐原 `原数据库服务` 经 @Global DatabaseModule 全局可见）。
    TENANT_STATUS_STORE,
    USER_STATUS_STORE,
    QUOTA_STORE,
    PLATFORM_IDENTITY_LOOKUP,
    SESSION_READER,
    PLATFORM_SETTINGS,
  ],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
