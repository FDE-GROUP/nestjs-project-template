import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantPermissionGuard } from './tenant-permission.guard';

function makeContext(
  headers: Record<string, unknown> = { cookie: 'session=abc' },
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function makeGuard({
  tenantId,
  required,
  hasPermission,
}: {
  tenantId?: string;
  required?: string[];
  hasPermission?: { success?: boolean; error?: unknown };
}) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const tenantContext = { tenantId } as never;
  const api = { hasPermission: vi.fn().mockResolvedValue(hasPermission) };
  const authInstance = { get: () => ({ api }) } as never;
  const guard = new TenantPermissionGuard(reflector as never, tenantContext, authInstance);
  return { guard, api, reflector };
}

describe('TenantPermissionGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: rejects when there is no active tenant', async () => {
    const { guard } = makeGuard({ tenantId: undefined, required: ['member:create'] });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an in-tenant request that declares no specific permission', async () => {
    const { guard, api } = makeGuard({ tenantId: 'org_1', required: undefined });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(api.hasPermission).not.toHaveBeenCalled();
  });

  it('grants when Better Auth reports the permission is satisfied', async () => {
    const { guard, api } = makeGuard({
      tenantId: 'org_1',
      required: ['member:create'],
      hasPermission: { success: true },
    });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(api.hasPermission).toHaveBeenCalledWith({
      headers: { cookie: 'session=abc' },
      body: { permissions: { member: ['create'] } },
    });
  });

  it('rejects (403) when the member lacks the required permission', async () => {
    const { guard } = makeGuard({
      tenantId: 'org_1',
      required: ['organization:delete'],
      hasPermission: { success: false },
    });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
