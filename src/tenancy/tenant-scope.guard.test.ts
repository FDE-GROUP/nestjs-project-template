import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantContextService } from './tenant-context.service';
import { TenantScopeGuard } from './tenant-scope.guard';

const ctx = { switchToHttp: () => ({}) } as unknown as ExecutionContext;

describe('TenantScopeGuard (S2 · FR-5 fail-closed)', () => {
  it('allows when an active tenant is bound', () => {
    const guard = new TenantScopeGuard({ tenantId: 'orgA' } as unknown as TenantContextService);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects with 403 when there is no active tenant', () => {
    const guard = new TenantScopeGuard({ tenantId: undefined } as unknown as TenantContextService);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
