import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { TenantContextService } from '../tenant-context.service';
import { REQUIRED_PERMISSIONS_KEY, toPermissionMap } from './permissions';

interface PermissionRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Enforces tenant-level RBAC for routes annotated with `@RequirePermissions`
 * (global-tenancy §9.3 / FR-4). Applied per-route via `@UseGuards` (not global — the
 * data-isolation guard that runs everywhere lands in S2).
 *
 * Fail-closed: without an active tenant context the request is rejected outright. The
 * actual permission decision is delegated to Better Auth's organization access control
 * (`auth.api.hasPermission`), so role→permission mapping has exactly one source of truth.
 */
@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fail-closed: a tenant-scoped route requires an active tenant (FR-5 seed).
    if (!this.tenantContext.tenantId) {
      throw new ForbiddenException('No active tenant context');
    }

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Authenticated + in-tenant is enough when the route declares no specific capability.
    if (!required || required.length === 0) return true;

    const auth = this.authInstance.get();
    if (!auth) throw new ForbiddenException('Auth instance not initialized');

    const req = context.switchToHttp().getRequest<PermissionRequest>();
    // Better Auth returns `{ success: boolean }` (and an `error` envelope when the caller
    // is not a member of the active organization); both outcomes fail closed to a 403.
    const result = await auth.api.hasPermission({
      headers: req.headers as unknown as Headers,
      body: { permissions: toPermissionMap(required) },
    });

    if (!result?.success) {
      throw new ForbiddenException(`Missing tenant permission: ${required.join(', ')}`);
    }
    return true;
  }
}
