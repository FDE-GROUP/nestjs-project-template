import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';

/**
 * Fail-closed gate for tenant-scoped routes (global-tenancy §9.3 / FR-5, seed of the
 * data-isolation boundary). It only asserts that an active tenant has been resolved for
 * the request (by `TenantMiddleware` into AsyncLocalStorage); the actual row filtering is
 * enforced centrally in the repository adapter, so no handler scatters `where tenant_id`
 * by hand. Applied per-route via `@UseGuards`; promotion to a global `APP_GUARD`
 * (blast radius = every route) is a separate, signed decision (高危#4).
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(@Inject(TenantContextService) private readonly tenant: TenantContextService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.tenant.tenantId) {
      throw new ForbiddenException('No active tenant context');
    }
    return true;
  }
}
