import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY, type TenantPermission } from './permissions';

/**
 * Declare the tenant-level permissions a route handler requires (global-tenancy §9.3 /
 * FR-4). Read back by `TenantPermissionGuard`, which delegates the actual decision to
 * Better Auth's organization access control — so this decorator is the single, declarative
 * place capability is requested (no scattered inline role checks).
 *
 * @example `@RequirePermissions('member:create')`
 */
export const RequirePermissions = (...permissions: TenantPermission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
