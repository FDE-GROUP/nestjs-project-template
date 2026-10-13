import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import type { TenantStatusService } from '@app/tenancy/lifecycle/tenant-status.service';
import { describe, expect, it, vi } from 'vitest';
import { ApproveTenantCommand } from '../approve-tenant.command';
import { ApproveTenantCommandHandler } from './approve-tenant.command-handler';

describe('ApproveTenantCommandHandler (S4 · FR-1)', () => {
  it('transitions to active and returns the receipt', async () => {
    const transition = vi.fn().mockResolvedValue(TENANT_STATUS.ACTIVE);
    const handler = new ApproveTenantCommandHandler({
      transition,
    } as unknown as TenantStatusService);
    await expect(handler.execute(new ApproveTenantCommand('org-1'))).resolves.toEqual({
      organizationId: 'org-1',
      status: TENANT_STATUS.ACTIVE,
    });
    expect(transition).toHaveBeenCalledWith('org-1', TENANT_STATUS.ACTIVE);
  });

  it('returns null when the tenant does not exist', async () => {
    const transition = vi.fn().mockResolvedValue(null);
    const handler = new ApproveTenantCommandHandler({
      transition,
    } as unknown as TenantStatusService);
    await expect(handler.execute(new ApproveTenantCommand('ghost'))).resolves.toBeNull();
  });
});
