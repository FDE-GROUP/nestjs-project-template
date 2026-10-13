/**
 * Tenant-level RBAC vocabulary (global-tenancy §9.1 / FR-4).
 *
 * The authority for "can this member do X in the active tenant" is Better Auth's
 * organization access control (`ac` + roles owner/admin/member). We never re-implement
 * a parallel permission matrix here (禁散点特判, §9.3): this module only standardises
 * how endpoints *declare* required permissions and converts them into the
 * `{ resource: actions[] }` body shape that `auth.api.hasPermission` expects.
 *
 * Built-in resources mirror Better Auth's default statements; business resources
 * (backed by `tenant_id` tables) are added when those tables land in S2.
 */

/** Built-in tenant-scoped resources provided by the Better Auth organization plugin. */
export type TenantResource = 'organization' | 'member' | 'invitation';

/** Actions available per built-in resource (mirrors better-auth defaultStatements). */
export const TENANT_ACTIONS: Record<TenantResource, readonly string[]> = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
};

/** A permission string is `resource:action`, e.g. `member:create`. */
export type TenantPermission = `${TenantResource}:${string}`;

/** Reflected metadata key set by `@RequirePermissions`. */
export const REQUIRED_PERMISSIONS_KEY = 'tenancy:requiredPermissions';

/**
 * Convert flat `resource:action` strings into Better Auth's grouped body shape:
 * `{ member: ['create'], organization: ['update'] }`. Invalid (unparseable) entries
 * are dropped so a typo degrades to "no requirement" rather than a malformed request;
 * callers should still surface a 403 when the resolved set is empty-but-expected.
 */
export function toPermissionMap(permissions: readonly string[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const permission of permissions) {
    const idx = permission.indexOf(':');
    if (idx <= 0 || idx === permission.length - 1) continue;
    const resource = permission.slice(0, idx);
    const action = permission.slice(idx + 1);
    if (!map[resource]) map[resource] = [];
    map[resource].push(action);
  }
  return map;
}
