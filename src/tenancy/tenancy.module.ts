import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';

/**
 * Multi-tenancy能力模块（global-tenancy S0 · 混合复用骨架）。
 * Exposes `TenantContextService` globally and binds the per-request tenant scope via
 * `TenantMiddleware` (AsyncLocalStorage). Enforcement guards (FR-5) land in S2.
 */
@Global()
@Module({
  providers: [TenantContextService],
  exports: [TenantContextService],
})
export class TenancyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
