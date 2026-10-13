import { describe, expect, it, vi } from 'vitest';
import type { TenantProvisioningRepository } from '../../../domain/repositories/tenant-provisioning.repository';
import { RejectTenantCommand } from '../reject-tenant.command';
import { RejectTenantCommandHandler } from './reject-tenant.command-handler';

describe('RejectTenantCommandHandler (S4 · FR-1)', () => {
  it('deletes the pending organization and reports hit/miss', async () => {
    const remove = vi.fn().mockResolvedValue(true);
    const handler = new RejectTenantCommandHandler({
      remove,
    } as unknown as TenantProvisioningRepository);
    await expect(handler.execute(new RejectTenantCommand('org-1'))).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith('org-1');

    const miss = new RejectTenantCommandHandler({
      remove: vi.fn().mockResolvedValue(false),
    } as unknown as TenantProvisioningRepository);
    await expect(miss.execute(new RejectTenantCommand('ghost'))).resolves.toBe(false);
  });
});
