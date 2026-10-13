import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TenantPermissionGuard } from './rbac/tenant-permission.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';

/**
 * Multi-tenancy能力模块（global-tenancy S0/S1 · 混合复用骨架）。
 * Exposes `TenantContextService` globally, binds the per-request tenant scope via
 * `TenantMiddleware` (AsyncLocalStorage), and provides `TenantPermissionGuard` (S1 ·
 * FR-4) for per-route tenant RBAC via `@UseGuards`. The always-on data-isolation
 * guard (FR-5) lands in S2.
 */
@Global()
@Module({
  providers: [TenantContextService, TenantPermissionGuard],
  exports: [TenantContextService, TenantPermissionGuard],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
