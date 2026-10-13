import type { DrizzleService } from '@app/database/drizzle.service';
import { organization } from '@app/database/schema';
import type { AuthInstance, InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleTenantProvisioningRepository } from './drizzle-tenant-provisioning.repository';

function makeDeps(rowsToDelete: { id: string }[] = []) {
  const createOrganization = vi
    .fn()
    .mockImplementation(({ body }: { body: any }) =>
      Promise.resolve({ id: 'org-new', metadata: body.metadata }),
    );
  const auth = { api: { createOrganization } } as unknown as AuthInstance;
  const authInstance = { get: () => auth, set: () => {} } as InjectAuthInstance;

  const returning = vi.fn().mockResolvedValue(rowsToDelete);
  const where = vi.fn((_w: unknown) => ({ returning }));
  const del = vi.fn((_t: unknown) => ({ where }));
  const db = { delete: del } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return {
    repo: new DrizzleTenantProvisioningRepository(drizzle, authInstance),
    createOrganization,
    where,
    del,
  };
}

describe('DrizzleTenantProvisioningRepository (S4 · FR-1 唯一建租户通道)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submit() calls BA createOrganization as a system action, forcing pending_approval + applicant userId', async () => {
    const { repo, createOrganization } = makeDeps();
    const receipt = await repo.submit('user-1', 'Acme', 'acme');

    const body = createOrganization.mock.calls[0][0].body as Record<string, unknown>;
    expect(body.userId).toBe('user-1');
    expect(body.name).toBe('Acme');
    expect(body.slug).toBe('acme');
    expect((body.metadata as Record<string, unknown>).status).toBe(TENANT_STATUS.PENDING);
    expect(receipt).toEqual({ organizationId: 'org-new', status: TENANT_STATUS.PENDING });
  });

  it('submit() throws when the auth instance is not yet initialized', async () => {
    const coldAuth = {
      get: () => undefined as unknown as AuthInstance,
      set: () => {},
    } as InjectAuthInstance;
    const repo = new DrizzleTenantProvisioningRepository({} as unknown as DrizzleService, coldAuth);
    await expect(repo.submit('u', 'n', 's')).rejects.toThrow(/Auth instance not initialized/);
  });

  it('remove() deletes scoped by organization id and reports hit/miss', async () => {
    const hit = makeDeps([{ id: 'org-1' }]);
    expect(await hit.repo.remove('org-1')).toBe(true);
    expect(hit.where.mock.calls[0][0]).toEqual(eq(organization.id, 'org-1'));

    const miss = makeDeps([]);
    expect(await miss.repo.remove('ghost')).toBe(false);
  });
});
