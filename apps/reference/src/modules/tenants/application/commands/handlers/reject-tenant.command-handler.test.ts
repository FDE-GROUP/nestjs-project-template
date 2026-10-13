import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
import type { TenantStatusService } from '@core/tenancy/lifecycle/tenant-status.service';
import type { PlatformAuditService } from '@core/tenancy/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantProvisioningRepository } from '../../../domain/repositories/tenant-provisioning.repository';
import { RejectTenantCommand } from '../reject-tenant.command';
import { RejectTenantCommandHandler } from './reject-tenant.command-handler';

function makeHandler(read: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn>) {
  const audit = { logTenantGovernance: vi.fn() };
  const handler = new RejectTenantCommandHandler(
    { remove } as unknown as TenantProvisioningRepository,
    { read } as unknown as TenantStatusService,
    audit as unknown as PlatformAuditService,
  );
  return { handler, audit };
}

describe('RejectTenantCommandHandler (S4/S5 · FR-1 仅 pending 可驳回 · FR-6 审计)', () => {
  it('deletes an explicit pending organization and audits the transition', async () => {
    const read = vi.fn().mockResolvedValue(TENANT_STATUS.PENDING);
    const remove = vi.fn().mockResolvedValue(true);
    const { handler, audit } = makeHandler(read, remove);
    await expect(handler.execute(new RejectTenantCommand('org-1', 'op-1'))).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith('org-1');
    expect(audit.logTenantGovernance).toHaveBeenCalledWith('reject', 'org-1', 'op-1', {
      from: TENANT_STATUS.PENDING,
      to: TENANT_STATUS.DELETED,
      error: undefined,
    });
  });

  it('misses (controller → 404) and audits when nothing is removed', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(false);
    const { handler, audit } = makeHandler(read, remove);
    await expect(handler.execute(new RejectTenantCommand('ghost', 'op-1'))).resolves.toBe(false);
    expect(audit.logTenantGovernance).toHaveBeenCalledWith('reject', 'ghost', 'op-1', {
      from: undefined,
      to: TENANT_STATUS.DELETED,
      error: 'not_found',
    });
  });

  it('rejects a non-pending (e.g. active) tenant with 409 without deleting', async () => {
    const read = vi.fn().mockResolvedValue(TENANT_STATUS.ACTIVE);
    const remove = vi.fn();
    const { handler, audit } = makeHandler(read, remove);
    await expect(handler.execute(new RejectTenantCommand('org-1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(audit.logTenantGovernance).toHaveBeenCalledWith('reject', 'org-1', 'op-1', {
      from: TENANT_STATUS.ACTIVE,
      error: 'not_pending',
    });
  });
});
