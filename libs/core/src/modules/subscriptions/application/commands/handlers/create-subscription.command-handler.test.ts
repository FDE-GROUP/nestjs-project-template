import type { QuotaService, SeatQuotaSnapshot } from '@core/saas-kit/tenancy/quota/quota.service';
import type { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProvisioner } from '../../../domain/ports/customer-provisioner.port';
import type { SubscriptionRepository } from '../../../domain/repositories/subscription.repository';
import { CreateSubscriptionCommandHandler } from './create-subscription.command-handler';

const VIEW: SeatQuotaSnapshot = {
  hasSubscription: true,
  plan: 'pro',
  seatsLimit: 50,
  used: 3,
  remaining: 47,
  providerCustomerId: 'cus_1',
};

function makeDeps() {
  const create = vi.fn().mockResolvedValue({ id: 'sub1' });
  const subscriptions = { create } as unknown as SubscriptionRepository;
  // §9.5.4①B/④ · P1c：处理器经 `CustomerProvisioner` 端口消费客户开通（PaymentService 适配留应用侧）。
  const provisionCustomer = vi.fn().mockResolvedValue({ id: 'cus_1', providerId: 'stripe' });
  const customers = { provisionCustomer } as unknown as CustomerProvisioner;
  const snapshot = vi.fn().mockResolvedValue(VIEW);
  const quota = { snapshot } as unknown as QuotaService;
  const tenant = { requireTenantId: () => 'orgA' } as unknown as TenantContextService;
  return {
    handler: new CreateSubscriptionCommandHandler(subscriptions, customers, quota, tenant),
    create,
    provisionCustomer,
    snapshot,
  };
}

describe('CreateSubscriptionCommandHandler (S7 · FR-8 tenant↔customer 映射)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the provider customer, maps it onto the row, defaults seats from the plan', async () => {
    const { handler, provisionCustomer, create } = makeDeps();
    const view = await handler.execute({ plan: 'pro', customerEmail: 'a@b.com' } as never);
    expect(provisionCustomer).toHaveBeenCalledWith('a@b.com');
    const draft = create.mock.calls[0][0] as Record<string, unknown>;
    expect(draft).toMatchObject({
      plan: 'pro',
      seatsLimit: 50, // pro 档位目录默认
      provider: 'stripe',
      providerCustomerId: 'cus_1',
    });
    expect(view).toBe(VIEW);
  });

  it('honours an explicit seatsLimit override', async () => {
    const { handler, create } = makeDeps();
    await handler.execute({ plan: 'pro', customerEmail: 'a@b.com', seatsLimit: 999 } as never);
    const draft = create.mock.calls[0][0] as Record<string, unknown>;
    expect(draft.seatsLimit).toBe(999);
  });

  it('does not persist a row when the provider customer creation fails (503 propagate)', async () => {
    const { create } = makeDeps();
    const failing = new CreateSubscriptionCommandHandler(
      { create } as unknown as SubscriptionRepository,
      {
        provisionCustomer: vi.fn().mockRejectedValue(new Error('no provider')),
      } as unknown as CustomerProvisioner,
      { snapshot: vi.fn() } as unknown as QuotaService,
      { requireTenantId: () => 'orgA' } as unknown as TenantContextService,
    );
    await expect(
      failing.execute({ plan: 'free', customerEmail: 'a@b.com' } as never),
    ).rejects.toThrow(/no provider/);
    expect(create).not.toHaveBeenCalled();
  });
});
