import { IS_PUBLIC_KEY } from '@core/tenancy/public.decorator';
import type { TenantContextService } from '@core/tenancy/tenant-context.service';
import { IS_TENANT_EXEMPT_KEY } from '@core/tenancy/tenant-exempt.decorator';
import { TenantScopeGuard } from '@core/tenancy/tenant-scope.guard';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

/** S11 复合全局：TenantScopeGuard 现读路由元数据·ctx 须供 getHandler/getClass。 */
const ctx = {
  switchToHttp: () => ({}),
  getHandler: () => function handler() {},
  getClass: () => class Controller {},
} as unknown as ExecutionContext;

/** 默认无 @Public/@TenantExempt（旁路不触发·落到租户裁决）。 */
function reflectorStub() {
  return { getAllAndOverride: () => undefined } as never;
}

/** 声明豁免：任一豁免键命中即旁路。 */
function exemptReflector() {
  return {
    getAllAndOverride: (key: symbol) => key === IS_TENANT_EXEMPT_KEY || key === IS_PUBLIC_KEY,
  } as never;
}

describe('TenantScopeGuard (S2 · FR-5 fail-closed · S11 全局租户墙)', () => {
  it('allows when an active tenant is bound', () => {
    const guard = new TenantScopeGuard(
      { tenantId: 'orgA' } as unknown as TenantContextService,
      reflectorStub(),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects with 403 when there is no active tenant', () => {
    const guard = new TenantScopeGuard(
      { tenantId: undefined } as unknown as TenantContextService,
      reflectorStub(),
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('S11 · @TenantExempt 旁路：声明豁免的路由跳过租户墙（无 tenant 亦放行·不抛 403）', () => {
    const guard = new TenantScopeGuard(
      { tenantId: undefined } as unknown as TenantContextService,
      exemptReflector(),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
