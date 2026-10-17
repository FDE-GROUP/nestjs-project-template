import { QuotaGuard } from '@core/saas-kit/modules/subscriptions/quota/quota.guard';
import type { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Only getHandler/getClass are exercised by the guard (no request access). */
function ctx(): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function reflectorReturning(requirement: unknown) {
  return { getAllAndOverride: vi.fn(() => requirement) } as unknown as Reflector;
}

function quotaService(over = false) {
  return {
    assertSeats: vi.fn(async () => {
      if (over) throw new HttpException('Seat quota exceeded', HttpStatus.PAYMENT_REQUIRED);
    }),
  } as unknown as QuotaService;
}

function tenantContext(tenantId?: string) {
  return { tenantId } as unknown as TenantContextService;
}

describe('QuotaGuard (S7 · FR-7 opt-in 逐路由·不触全局 APP_GUARD)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is a no-op when the route declares no @Quota (opt-in)', async () => {
    const assertSeats = vi.fn();
    const guard = new QuotaGuard(reflectorReturning(undefined), tenantContext('t1'), {
      assertSeats,
    } as unknown as QuotaService);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(assertSeats).not.toHaveBeenCalled();
  });

  it('checks seats against the active tenant with the declared delta', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning({ seats: 3 }), tenantContext('t1'), svc);
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(svc.assertSeats).toHaveBeenCalledWith('t1', 3);
  });

  it('defaults the delta to 1 when @Quota is declared without seats', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning({}), tenantContext('t1'), svc);
    await guard.canActivate(ctx());
    expect(svc.assertSeats).toHaveBeenCalledWith('t1', 1);
  });

  it('fails closed (403) when there is no active tenant context', async () => {
    const svc = quotaService(false);
    const guard = new QuotaGuard(reflectorReturning({ seats: 1 }), tenantContext(undefined), svc);
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(ForbiddenException);
    expect(svc.assertSeats).not.toHaveBeenCalled();
  });

  it('propagates the 402 when over quota', async () => {
    const guard = new QuotaGuard(
      reflectorReturning({ seats: 1 }),
      tenantContext('t1'),
      quotaService(true),
    );
    await expect(guard.canActivate(ctx())).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
  });
});
