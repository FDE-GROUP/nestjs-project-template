import type { QuotaService, SeatQuotaSnapshot } from '@core/tenancy/quota/quota.service';
import type { TenantContextService } from '@core/tenancy/tenant-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetSubscriptionQueryHandler } from './get-current-subscription.query-handler';

const VIEW: SeatQuotaSnapshot = {
  hasSubscription: false,
  plan: 'free',
  seatsLimit: 5,
  used: 0,
  remaining: 5,
  providerCustomerId: null,
};

describe('GetSubscriptionQueryHandler (S7 · FR-7/FR-8 读侧单点)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assembles the snapshot for the ALS-resolved tenant', async () => {
    const snapshot = vi.fn().mockResolvedValue(VIEW);
    const quota = { snapshot } as unknown as QuotaService;
    const tenant = { requireTenantId: () => 'orgA' } as unknown as TenantContextService;
    const handler = new GetSubscriptionQueryHandler(quota, tenant);

    const result = await handler.execute({} as never);
    expect(snapshot).toHaveBeenCalledWith('orgA');
    expect(result).toBe(VIEW);
  });
});
