import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../../shared-kernel/errors/error-codes';
import { TenantContextService } from '../tenant-context.service';
import { REQUIRED_PERMISSIONS_KEY, toPermissionMap } from './permissions';
import { TENANT_PERMISSION_CHECKER, type TenantPermissionChecker } from './tenant-permission.port';

interface PermissionRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Enforces tenant-level RBAC for routes annotated with `@RequirePermissions`
 * (global-tenancy §9.3 / FR-4). Applied per-route via `@UseGuards` (not global — the
 * data-isolation guard that runs everywhere lands in S2).
 *
 * Fail-closed: without an active tenant context the request is rejected outright. The
 * actual permission decision is delegated to the core-owned `TenantPermissionChecker`
 * port (§9.5.4①B · P1b) — the Better Auth `hasPermission` call stays on the app side, so
 * role→permission mapping has exactly one source of truth and core imports no auth impl.
 */
@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantContextService) private readonly tenantContext: TenantContextService,
    @Inject(TENANT_PERMISSION_CHECKER) private readonly checker: TenantPermissionChecker,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fail-closed: a tenant-scoped route requires an active tenant (FR-5 seed).
    if (!this.tenantContext.tenantId) {
      throw new ForbiddenException('No active tenant context', {
        errorCode: ERROR_CODES.TENANCY_NO_ACTIVE_CONTEXT,
      });
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Authenticated + in-tenant is enough when the route declares no specific capability.
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<PermissionRequest>();
    // Standardise the flat `resource:action` list into the grouped `{ resource: actions[] }`
    // shape, then delegate the allow/deny decision to the port (fail-closed → 403).
    const allowed = await this.checker.hasPermission(req.headers, toPermissionMap(required));
    if (!allowed) {
      throw new ForbiddenException(`Missing tenant permission: ${required.join(', ')}`, {
        errorCode: ERROR_CODES.TENANCY_PERMISSION_DENIED,
      });
    }
    return true;
  }
}
