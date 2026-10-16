import type { CanRequirement } from '@core/saas-kit/tenancy/rbac/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/tenancy/rbac/tenant-permission.guard';
import type { TenantPermissionChecker } from '@core/saas-kit/tenancy/rbac/tenant-permission.port';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeContext(): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

/**
 * module-rbac-casl §2.2 换形后的守卫契约：守卫经 `TenantPermissionChecker` 端口消费**同步**
 * 布尔裁决，输入 = `@Can` 声明 (action, subject) + ALS 预注入角色（丙裁）。
 * 「规则 → CASL ability 判定」由工厂矩阵锁测覆盖，守卫测试只锁声明→端口的形状。
 */
function makeGuard({
  tenantId,
  role,
  requirement,
  allowed,
}: {
  tenantId?: string;
  role?: 'owner' | 'admin' | 'member';
  requirement?: CanRequirement;
  allowed?: boolean;
}) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requirement) };
  const tenantContext = { tenantId, role } as never;
  const can = vi.fn().mockReturnValue(allowed ?? false);
  const checker = { can } as unknown as TenantPermissionChecker;
  const guard = new TenantPermissionGuard(reflector as never, tenantContext, checker);
  return { guard, can, reflector };
}

describe('TenantPermissionGuard（CASL 换形）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: rejects when there is no active tenant', () => {
    const { guard, can } = makeGuard({
      tenantId: undefined,
      requirement: { action: 'create', subject: 'Member' },
    });
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
    expect(can).not.toHaveBeenCalled();
  });

  it('allows an in-tenant request that declares no @Can requirement', () => {
    const { guard, can } = makeGuard({ tenantId: 'org_1' });
    expect(guard.canActivate(makeContext())).toBe(true);
    expect(can).not.toHaveBeenCalled();
  });

  it('grants when the checker reports the requirement is satisfied（端口收 ALS 注入的角色）', () => {
    const { guard, can } = makeGuard({
      tenantId: 'org_1',
      role: 'admin',
      requirement: { action: 'create', subject: 'Member' },
      allowed: true,
    });
    expect(guard.canActivate(makeContext())).toBe(true);
    expect(can).toHaveBeenCalledWith({ role: 'admin', action: 'create', subject: 'Member' });
  });

  it('rejects (403) when the member lacks the required permission', () => {
    const { guard } = makeGuard({
      tenantId: 'org_1',
      role: 'member',
      requirement: { action: 'delete', subject: 'Organization' },
      allowed: false,
    });
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });

  it('缺角色（ALS 未注入）以 role=undefined 交端口 → 桩拒 → 403（fail-closed 贯通）', () => {
    const { guard, can } = makeGuard({
      tenantId: 'org_1',
      role: undefined,
      requirement: { action: 'read', subject: 'Workspace' },
      allowed: false,
    });
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
    expect(can).toHaveBeenCalledWith({ role: undefined, action: 'read', subject: 'Workspace' });
  });
});
