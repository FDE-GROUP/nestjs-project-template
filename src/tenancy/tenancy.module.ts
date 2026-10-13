import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TenantPermissionGuard } from './rbac/tenant-permission.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantScopeGuard } from './tenant-scope.guard';

/**
 * Multi-tenancy能力模块（global-tenancy S0/S1/S2 · 混合复用骨架）。
 * Exposes `TenantContextService` globally, binds the per-request tenant scope via
 * `TenantMiddleware` (AsyncLocalStorage), and provides two per-route guards:
 * - `TenantPermissionGuard` (S1 · FR-4): tenant RBAC, delegates to Better Auth ac.
 * - `TenantScopeGuard` (S2 · FR-5): fail-closed gate requiring an active tenant.
 * Row-level filtering is enforced in each aggregate's repository adapter (single
 * choke-point, 禁散点); promoting these guards to a global APP_GUARD is a separate
 * signed decision (高危#4).
 */
@Global()
@Module({
  providers: [TenantContextService, TenantPermissionGuard, TenantScopeGuard],
  exports: [TenantContextService, TenantPermissionGuard, TenantScopeGuard],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
