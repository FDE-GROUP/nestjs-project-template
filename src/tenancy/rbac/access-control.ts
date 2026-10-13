import { createAccessControl } from 'better-auth/plugins';

/**
 * Tenant-level access control (global-tenancy §9.1 / FR-4, D2).
 *
 * Better Auth's organization `ac` + `roles` remain the SINGLE source of truth for
 * "can this member do X in the active tenant" (禁散点特判, §9.3). S3 adds a `workspace`
 * resource so workspace CRUD is gated the same way as member/invitation.
 *
 * IMPORTANT: `organization()` merges roles via `{ ...defaultRoles, ...opts.roles }`, so
 * overriding `owner/admin/member` REPLACES their whole statement set. We therefore declare
 * the FULL vocabulary — the built-in resources mirrored EXACTLY from Better Auth defaults
 * (see access/statement.mjs) plus the new `workspace` — so no existing org-endpoint
 * behaviour changes; the only delta is the appended `workspace` actions.
 *
 * Per the S3 human call (D2: workspace has NO separate role layer — access is decided at
 * the tenant level):
 *   - `workspace:read`                      → ALL tenant members (list to pick an active one)
 *   - `workspace:create` / `update` / `delete` → owner + admin only (member gets none)
 */
export const tenantAccessControl = createAccessControl({
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  workspace: ['create', 'read', 'update', 'delete'],
});

export const tenantRoles = {
  owner: tenantAccessControl.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    workspace: ['create', 'read', 'update', 'delete'],
  }),
  admin: tenantAccessControl.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    workspace: ['create', 'read', 'update', 'delete'],
  }),
  member: tenantAccessControl.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ['read'],
    workspace: ['read'],
  }),
};
