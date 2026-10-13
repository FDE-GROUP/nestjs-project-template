import type { PaymentService } from '@app/modules/payment/services/payment.service';
import type { QuotaService, SeatQuotaSnapshot } from '@app/tenancy/quota/quota.service';
import type { TenantContextService } from '@app/tenancy/tenant-context.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  const createCustomer = vi.fn().mockResolvedValue({ id: 'cus_1', providerId: 'stripe' });
  const payment = { createCustomer } as unknown as PaymentService;
  const snapshot = vi.fn().mockResolvedValue(VIEW);
  const quota = { snapshot } as unknown as QuotaService;
  const tenant = { requireTenantId: () => 'orgA' } as unknown as TenantContextService;
  return {
    handler: new CreateSubscriptionCommandHandler(subscriptions, payment, quota, tenant),
    create,
    createCustomer,
    snapshot,
  };
}

describe('CreateSubscriptionCommandHandler (S7 · FR-8 tenant↔customer 映射)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the provider customer, maps it onto the row, defaults seats from the plan', async () => {
    const { handler, createCustomer, create } = makeDeps();
    const view = await handler.execute({ plan: 'pro', customerEmail: 'a@b.com' } as never);
    expect(createCustomer).toHaveBeenCalledWith({ email: 'a@b.com' });
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
        createCustomer: vi.fn().mockRejectedValue(new Error('no provider')),
      } as unknown as PaymentService,
      { snapshot: vi.fn() } as unknown as QuotaService,
      { requireTenantId: () => 'orgA' } as unknown as TenantContextService,
    );
    await expect(
      failing.execute({ plan: 'free', customerEmail: 'a@b.com' } as never),
    ).rejects.toThrow(/no provider/);
    expect(create).not.toHaveBeenCalled();
  });
});
