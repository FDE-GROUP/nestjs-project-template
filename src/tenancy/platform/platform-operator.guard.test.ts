import type { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformOperatorGuard } from './platform-operator.guard';

function ctxWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

function drizzleReturningRows(rows: { role: string }[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { drizzle: { db: { select } } as unknown as DrizzleService, where };
}

describe('PlatformOperatorGuard (S4 · FR-11/13 过渡判据)', () => {
  const getSession = vi.fn();
  const authInstance = {
    get: () => ({ api: { getSession } }) as never,
    set: () => {},
  } satisfies InjectAuthInstance;

  beforeEach(() => {
    getSession.mockReset();
  });

  it('allows a session user whose DB role is ADMIN', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { drizzle } = drizzleReturningRows([{ role: 'ADMIN' }]);
    await expect(
      new PlatformOperatorGuard(authInstance, drizzle).canActivate(ctxWith({})),
    ).resolves.toBe(true);
  });

  it('rejects a non-admin (USER) with 403', async () => {
    getSession.mockResolvedValue({ user: { id: 'u2' } });
    const { drizzle } = drizzleReturningRows([{ role: 'USER' }]);
    await expect(
      new PlatformOperatorGuard(authInstance, drizzle).canActivate(ctxWith({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when no user row is found', async () => {
    getSession.mockResolvedValue({ user: { id: 'ghost' } });
    const { drizzle } = drizzleReturningRows([]);
    await expect(
      new PlatformOperatorGuard(authInstance, drizzle).canActivate(ctxWith({})),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 401 when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const { drizzle } = drizzleReturningRows([{ role: 'ADMIN' }]);
    await expect(
      new PlatformOperatorGuard(authInstance, drizzle).canActivate(ctxWith({})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('queries the role scoped to the session user id', async () => {
    getSession.mockResolvedValue({ user: { id: 'u9' } });
    const { drizzle, where } = drizzleReturningRows([{ role: 'ADMIN' }]);
    await new PlatformOperatorGuard(authInstance, drizzle).canActivate(ctxWith({}));
    expect(where.mock.calls[0][0]).toEqual(eq(user.id, 'u9'));
  });
});
