import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { describe, expect, it, vi } from 'vitest';
import type { TenantProvisioningRepository } from '../../../domain/repositories/tenant-provisioning.repository';
import { SubmitTenantApplicationCommand } from '../submit-tenant-application.command';
import { SubmitTenantApplicationCommandHandler } from './submit-tenant-application.command-handler';

describe('SubmitTenantApplicationCommandHandler (S4 · FR-1)', () => {
  it('routes to the provisioning gateway and projects the receipt', async () => {
    const submit = vi
      .fn()
      .mockResolvedValue({ organizationId: 'org-9', status: TENANT_STATUS.PENDING });
    const handler = new SubmitTenantApplicationCommandHandler({
      submit,
    } as unknown as TenantProvisioningRepository);

    await expect(
      handler.execute(new SubmitTenantApplicationCommand('u1', 'Acme', 'acme')),
    ).resolves.toEqual({
      organizationId: 'org-9',
      status: TENANT_STATUS.PENDING,
    });
    expect(submit).toHaveBeenCalledWith('u1', 'Acme', 'acme');
  });
});
