import { describe, expect, it } from 'vitest';
import { TENANT_ACTIONS, toPermissionMap } from './permissions';

describe('tenant rbac permissions', () => {
  it('groups resource:action strings into Better Auth permission maps', () => {
    expect(toPermissionMap(['member:create', 'member:update', 'organization:delete'])).toEqual({
      member: ['create', 'update'],
      organization: ['delete'],
    });
  });

  it('drops malformed entries so a typo degrades instead of sending a bad body', () => {
    expect(toPermissionMap(['noColon', ':action', 'resource:', 'member:create'])).toEqual({
      member: ['create'],
    });
  });

  it('exposes the built-in resource actions (mirrors better-auth defaultStatements)', () => {
    expect(TENANT_ACTIONS.organization).toContain('delete');
    expect(TENANT_ACTIONS.member).toContain('create');
    expect(TENANT_ACTIONS.invitation).toEqual(['create', 'cancel']);
  });
});
