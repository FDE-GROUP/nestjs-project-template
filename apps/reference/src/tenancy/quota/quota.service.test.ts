import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaService } from './quota.service';
import type { ActiveSubscriptionView, QuotaStore } from './quota.store';
import { FREE_PLAN } from './tenant-plans';

/**
 * 桩 `QuotaStore`（§9.5.4①B 端口倒置后·服务不再感知 Drizzle/schema）。
 * `sub` 控当前生效订阅视图（null=无 active 行）；`used` 控成员数。
 */
function makeService(opts: { sub?: ActiveSubscriptionView | null; used?: number } = {}) {
  const currentActiveSubscription = vi.fn(async (_t: string) =>
    opts.sub === undefined ? null : opts.sub,
  );
  const countMembers = vi.fn(async (_t: string) => opts.used ?? 0);
  const store = { currentActiveSubscription, countMembers } as unknown as QuotaStore;
  return { svc: new QuotaService(store), currentActiveSubscription, countMembers };
}

describe('QuotaService (S7 · FR-7 seat-quota choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('currentSubscription returns the latest active view', async () => {
    const { svc } = makeService({ sub: { plan: 'pro', seatsLimit: 20, providerCustomerId: 'x' } });
    expect(await svc.currentSubscription('t1')).toMatchObject({ plan: 'pro', seatsLimit: 20 });
  });

  it('currentSubscription returns null when none', async () => {
    const { svc } = makeService({ sub: null });
    expect(await svc.currentSubscription('t1')).toBeNull();
  });

  it('effectiveSeatsLimit takes the active subscription snapshot', async () => {
    const { svc } = makeService({ sub: { plan: 'pro', seatsLimit: 42, providerCustomerId: null } });
    expect(await svc.effectiveSeatsLimit('t1')).toBe(42);
  });

  it('effectiveSeatsLimit falls back to the FREE plan when no active subscription (裁②)', async () => {
    const { svc } = makeService({ sub: null });
    expect(await svc.effectiveSeatsLimit('t1')).toBe(FREE_PLAN.seatsLimit);
  });

  it('currentSeats counts members as a number', async () => {
    const { svc } = makeService({ used: 7 });
    expect(await svc.currentSeats('t1')).toBe(7);
  });

  it('checkSeats reports ok within limit', async () => {
    // limit=5 (no sub) + used=3, adding=1 → 4<=5
    const { svc } = makeService({ sub: null, used: 3 });
    expect(await svc.checkSeats('t1', 1)).toEqual({ ok: true, used: 3, limit: 5 });
  });

  it('checkSeats reports not-ok when the projection exceeds the limit', async () => {
    const { svc } = makeService({
      sub: { plan: 'pro', seatsLimit: 2, providerCustomerId: null },
      used: 2,
    });
    expect(await svc.checkSeats('t1', 1)).toEqual({ ok: false, used: 2, limit: 2 });
  });

  it('assertSeats throws 402 when over quota', async () => {
    const { svc } = makeService({
      sub: { plan: 'pro', seatsLimit: 1, providerCustomerId: null },
      used: 1,
    });
    await expect(svc.assertSeats('t1', 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('assertSeats rejection carries HTTP 402 (Payment Required)', async () => {
    const { svc } = makeService({
      sub: { plan: 'pro', seatsLimit: 1, providerCustomerId: null },
      used: 1,
    });
    await expect(svc.assertSeats('t1', 1)).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('assertSeats resolves when within quota', async () => {
    const { svc } = makeService({
      sub: { plan: 'pro', seatsLimit: 10, providerCustomerId: null },
      used: 1,
    });
    await expect(svc.assertSeats('t1', 1)).resolves.toBeUndefined();
  });

  it('snapshot assembles the view from the active subscription (plan/limit/used/remaining/mapping)', async () => {
    const { svc } = makeService({
      sub: { plan: 'pro', seatsLimit: 20, providerCustomerId: 'cus_1' },
      used: 4,
    });
    expect(await svc.snapshot('t1')).toEqual({
      hasSubscription: true,
      plan: 'pro',
      seatsLimit: 20,
      used: 4,
      remaining: 16,
      providerCustomerId: 'cus_1',
    });
  });

  it('snapshot falls back to the FREE plan when no active subscription (裁②)', async () => {
    const { svc } = makeService({ sub: null, used: 0 });
    expect(await svc.snapshot('t1')).toEqual({
      hasSubscription: false,
      plan: FREE_PLAN.plan,
      seatsLimit: FREE_PLAN.seatsLimit,
      used: 0,
      remaining: FREE_PLAN.seatsLimit,
      providerCustomerId: null,
    });
  });
});
