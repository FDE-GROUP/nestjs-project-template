import type { DrizzleService } from '@app/database/drizzle.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotaService } from './quota.service';
import { FREE_PLAN } from './tenant-plans';

/** Awaitable builder mimicking drizzle's chainable select: from/where/orderBy/limit → rows. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    from: () => c,
    where: () => c,
    orderBy: () => c,
    limit: () => c,
  };
  c['then'] = (res: (v: unknown[]) => unknown) => Promise.resolve(rows).then(res);
  return c;
}

/** Feeds each `select` call in order from `queues`. */
function makeService(queues: unknown[][]) {
  let call = 0;
  const select = vi.fn(() => chain(queues[call++] ?? []));
  const db = { select } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  return { svc: new QuotaService(drizzle), select };
}

describe('QuotaService (S7 · FR-7 seat-quota choke-point)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('currentSubscription returns the latest active row', async () => {
    const row = { id: 's1', seatsLimit: 20, status: 'active' };
    const { svc } = makeService([[row]]);
    expect(await svc.currentSubscription('t1')).toMatchObject({ id: 's1', seatsLimit: 20 });
  });

  it('currentSubscription returns null when none', async () => {
    const { svc } = makeService([[]]);
    expect(await svc.currentSubscription('t1')).toBeNull();
  });

  it('effectiveSeatsLimit takes the active subscription snapshot', async () => {
    const { svc } = makeService([[{ seatsLimit: 42 }]]);
    expect(await svc.effectiveSeatsLimit('t1')).toBe(42);
  });

  it('effectiveSeatsLimit falls back to the FREE plan when no active subscription (裁②)', async () => {
    const { svc } = makeService([[]]);
    expect(await svc.effectiveSeatsLimit('t1')).toBe(FREE_PLAN.seatsLimit);
  });

  it('currentSeats counts members as a number', async () => {
    const { svc } = makeService([[{ value: '7' }]]);
    expect(await svc.currentSeats('t1')).toBe(7);
  });

  it('checkSeats reports ok within limit', async () => {
    // limit=5 (no sub) via first select, used=3 via second select; adding=1 → 4<=5
    const { svc } = makeService([[], [{ value: 3 }]]);
    expect(await svc.checkSeats('t1', 1)).toEqual({ ok: true, used: 3, limit: 5 });
  });

  it('checkSeats reports not-ok when the projection exceeds the limit', async () => {
    const { svc } = makeService([[{ seatsLimit: 2 }], [{ value: 2 }]]);
    expect(await svc.checkSeats('t1', 1)).toEqual({ ok: false, used: 2, limit: 2 });
  });

  it('assertSeats throws 402 when over quota', async () => {
    const { svc } = makeService([[{ seatsLimit: 1 }], [{ value: 1 }]]);
    await expect(svc.assertSeats('t1', 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('assertSeats rejection carries HTTP 402 (Payment Required)', async () => {
    const { svc } = makeService([[{ seatsLimit: 1 }], [{ value: 1 }]]);
    await expect(svc.assertSeats('t1', 1)).rejects.toMatchObject({
      status: HttpStatus.PAYMENT_REQUIRED,
    });
  });

  it('assertSeats resolves when within quota', async () => {
    const { svc } = makeService([[{ seatsLimit: 10 }], [{ value: 1 }]]);
    await expect(svc.assertSeats('t1', 1)).resolves.toBeUndefined();
  });

  it('snapshot assembles the view from the active subscription (plan/limit/used/remaining/mapping)', async () => {
    const { svc } = makeService([
      [{ seatsLimit: 20, plan: 'pro', providerCustomerId: 'cus_1' }],
      [{ value: 4 }],
    ]);
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
    const { svc } = makeService([[], [{ value: 0 }]]);
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
