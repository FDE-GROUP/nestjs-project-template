import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
import { PlatformAuditService } from '@core/tenancy/platform/platform-audit.service';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlatformAuditService (S5 · FR-6 结构化审计单点)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const svc = new PlatformAuditService();

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('emits a machine-readable audit payload for a governance action', () => {
    svc.logTenantGovernance('approve', 'orgA', 'op1', {
      from: TENANT_STATUS.PENDING,
      to: TENANT_STATUS.ACTIVE,
    });
    const payload = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      audit: 'platform.tenant',
      action: 'approve',
      organizationId: 'orgA',
      operatorId: 'op1',
      from: TENANT_STATUS.PENDING,
      to: TENANT_STATUS.ACTIVE,
    });
    expect(typeof payload.at).toBe('string');
  });

  it('emits a platform.user audit payload for a user governance action (S6)', () => {
    svc.logUserGovernance('suspend', 'u1', 'op1', {
      from: TENANT_STATUS.ACTIVE,
      to: TENANT_STATUS.SUSPENDED,
    });
    const payload = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      audit: 'platform.user',
      action: 'suspend',
      userId: 'u1',
      operatorId: 'op1',
      from: TENANT_STATUS.ACTIVE,
      to: TENANT_STATUS.SUSPENDED,
    });
  });

  it('carries the failure context on an illegal transition', () => {
    svc.logTenantGovernance('suspend', 'orgA', 'op1', {
      from: TENANT_STATUS.PENDING,
      to: TENANT_STATUS.SUSPENDED,
      error: 'illegal_transition',
    });
    const payload = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.error).toBe('illegal_transition');
  });

  it('omits detail fields when none are provided', () => {
    svc.logTenantGovernance('delete', 'orgB', 'op2');
    const payload = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.from).toBeUndefined();
    expect(payload.to).toBeUndefined();
  });
});
