import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantContextService } from './tenant-context.service';
import { IS_TENANT_EXEMPT_KEY } from './tenant-exempt.decorator';

/**
 * Fail-closed gate for tenant-scoped routes (global-tenancy §9.3 / FR-5, seed of the
 * data-isolation boundary). It only asserts that an active tenant has been resolved for
 * the request (by `TenantMiddleware` into AsyncLocalStorage); the actual row filtering is
 * enforced centrally in the repository adapter, so no handler scatters `where tenant_id`
 * by hand.
 *
 * S11 · 高危#4 复合全局：本守卫经 `TenancyModule` 注册为全局 `APP_GUARD`（deny-by-default 租户墙），
 * 运行于全局会话墙之后（`AppModule` 中 `AuthModule` 先于 `TenancyModule` → 401 先于 403）。所有
 * 路由默认要求已绑定 active 租户；唯显式旁路可豁免：`@Public()`（无会话=无租户·认证面/webhook）
 * 或 `@TenantExempt()`（需会话但合法无租户·建租申请/跨租治理/个人 PIPL/用户级 storage·payment）。
 * 元数据经 `Reflector.getAllAndOverride` 读回（handler 优先 class·同 `TenantPermissionGuard` 口径）。
 * 逐路由 `@UseGuards(TenantScopeGuard)` 仍可与全局并存（幂等·无短路冲突）。
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    // @Public 蕴含无会话→无租户；@TenantExempt 需会话但跳过租户墙。二者任一即旁路。
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(IS_TENANT_EXEMPT_KEY, targets)
    ) {
      return true;
    }
    if (!this.tenant.tenantId) {
      throw new ForbiddenException('No active tenant context');
    }
    return true;
  }
}
