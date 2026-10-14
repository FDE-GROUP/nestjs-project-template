import { describe, expect, it } from 'vitest';
import { tenantRoles } from './tenancy-access-control';

// Pure assertions against Better Auth's access-control `authorize` contract — no DB.
// These lock the S3 human call and guard the "mirror defaults exactly" invariant:
// changing base statements would flip these org-resource expectations too.
describe('tenantRoles · workspace permission tiers (S3 · D2/FR-4)', () => {
  const can = (role: keyof typeof tenantRoles, resource: string, action: string) =>
    tenantRoles[role].authorize({ [resource]: [action] }).success === true;

  it('workspace:read is granted to ALL members (list to pick an active one)', () => {
    expect(can('owner', 'workspace', 'read')).toBe(true);
    expect(can('admin', 'workspace', 'read')).toBe(true);
    expect(can('member', 'workspace', 'read')).toBe(true);
  });

  it('workspace create/update/delete are owner+admin only', () => {
    for (const action of ['create', 'update', 'delete']) {
      expect(can('owner', 'workspace', action)).toBe(true);
      expect(can('admin', 'workspace', action)).toBe(true);
      expect(can('member', 'workspace', action)).toBe(false);
    }
  });

  it('base org resources still mirror Better Auth defaults (regression for role override)', () => {
    // owner can update AND delete the organization; admin only update; member neither.
    expect(can('owner', 'organization', 'update')).toBe(true);
    expect(can('owner', 'organization', 'delete')).toBe(true);
    expect(can('admin', 'organization', 'update')).toBe(true);
    expect(can('admin', 'organization', 'delete')).toBe(false);
    expect(can('member', 'organization', 'update')).toBe(false);
    // member keeps read-only ac, nothing on member/invitation management.
    expect(can('member', 'ac', 'read')).toBe(true);
    expect(can('member', 'member', 'create')).toBe(false);
    expect(can('member', 'invitation', 'create')).toBe(false);
  });
});
