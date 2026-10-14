import { TenantPermissionGuard } from '@core/saas-kit/tenancy/rbac/tenant-permission.guard';
import type { TenantPermissionChecker } from '@core/saas-kit/tenancy/rbac/tenant-permission.port';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeContext(
  headers: Record<string, unknown> = { cookie: 'session=abc' },
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * §9.5.4①B · P1b：守卫经 `TenantPermissionChecker` 端口消费裁决——桩 `hasPermission` 返回布尔。
 * 「是否落到 BA `hasPermission` 的 `{ headers, body:{permissions} }` 形状」由适配单测覆盖。
 */
function makeGuard({
  tenantId,
  required,
  allowed,
}: {
  tenantId?: string;
  required?: string[];
  allowed?: boolean;
}) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const tenantContext = { tenantId } as never;
  const hasPermission = vi.fn().mockResolvedValue(allowed ?? false);
  const checker = { hasPermission } as unknown as TenantPermissionChecker;
  const guard = new TenantPermissionGuard(reflector as never, tenantContext, checker);
  return { guard, hasPermission, reflector };
}

describe('TenantPermissionGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: rejects when there is no active tenant', async () => {
    const { guard, hasPermission } = makeGuard({
      tenantId: undefined,
      required: ['member:create'],
    });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('allows an in-tenant request that declares no specific permission', async () => {
    const { guard, hasPermission } = makeGuard({ tenantId: 'org_1', required: undefined });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('grants when the checker reports the permission is satisfied', async () => {
    const { guard, hasPermission } = makeGuard({
      tenantId: 'org_1',
      required: ['member:create'],
      allowed: true,
    });
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    // Guard standardises the flat list into the grouped `{ resource: actions[] }` map for the port.
    expect(hasPermission).toHaveBeenCalledWith({ cookie: 'session=abc' }, { member: ['create'] });
  });

  it('rejects (403) when the member lacks the required permission', async () => {
    const { guard } = makeGuard({
      tenantId: 'org_1',
      required: ['organization:delete'],
      allowed: false,
    });
    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
