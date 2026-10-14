import type { DrizzleService } from '@app/database/drizzle.service';
import { tenantSubscription } from '@app/database/schema';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { ForbiddenException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DrizzleSubscriptionRepository } from './drizzle-subscription.repository';

function makeRepo(tenantId: string | null) {
  const requireTenantId = vi.fn(() => {
    if (!tenantId) throw new ForbiddenException('Missing active tenant context');
    return tenantId;
  });
  const tenant = { requireTenantId } as unknown as TenantContextService;

  // insert().values(...).returning()
  const returning = vi.fn().mockResolvedValue([{ id: 'sub1', tenantId, status: 'active' }]);
  const values = vi.fn((_v: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn((_t: unknown) => ({ values }));

  // select().from(...).where(...).orderBy(...) → awaitable rows (history)
  const orderBy = vi.fn(() => Promise.resolve([{ id: 'sub1' }]));
  const where = vi.fn((_w: unknown) => ({ orderBy }));
  const from = vi.fn((_t: unknown) => ({ where }));
  const select = vi.fn(() => ({ from }));

  const db = { insert, select } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return {
    repo: new DrizzleSubscriptionRepository(drizzle, tenant),
    spies: { requireTenantId, insert, values, returning, select, where, orderBy },
  };
}

describe('DrizzleSubscriptionRepository · tenant isolation (S7 · FR-5 choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fail-closed: create/history refuse and never touch the db when no tenant is bound', async () => {
    const { repo, spies } = makeRepo(null);
    await expect(repo.create({ plan: 'pro', seatsLimit: 20 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(repo.history()).rejects.toBeInstanceOf(ForbiddenException);
    expect(spies.insert).not.toHaveBeenCalled();
    expect(spies.select).not.toHaveBeenCalled();
  });

  it('create() stamps the ALS tenant + forces status=active (1:N history append)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.create({ plan: 'pro', seatsLimit: 20, providerCustomerId: 'cus_1' });
    const inserted = spies.values.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      tenantId: 'orgA',
      status: 'active',
      plan: 'pro',
      seatsLimit: 20,
      providerCustomerId: 'cus_1',
      provider: null,
    });
    // regression: `updatedAt` is NOT NULL w/ no DB default — insert must stamp it (real-DB round-trip)
    expect(inserted.updatedAt).toBeInstanceOf(Date);
    expect(inserted.createdAt).toBeInstanceOf(Date);
  });

  it('history() ALWAYS filters by the active tenant (red if the where clause is dropped)', async () => {
    const { repo, spies } = makeRepo('orgA');
    await repo.history();
    const whereArg = spies.where.mock.calls[0][0];
    expect(whereArg).toEqual(eq(tenantSubscription.tenantId, 'orgA'));
  });
});
