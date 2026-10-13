import type { ConfigService } from '@app/config/config.service';
import type { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { UserStatusService } from '@app/tenancy/lifecycle/user-status.service';
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

function drizzleReturningRows(rows: { email: string }[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { drizzle: { db: { select } } as unknown as DrizzleService, where };
}

function configWith(operatorEmail: string) {
  return {
    getPlatformConfig: () => ({ operatorEmail }),
  } as unknown as ConfigService;
}

function userStatusMock(blocked = false) {
  return { isBlocked: async () => blocked } as unknown as UserStatusService;
}

describe('PlatformOperatorGuard (S5 · FR-13 正式判据：email 命中配置)', () => {
  const getSession = vi.fn();
  const authInstance = {
    get: () => ({ api: { getSession } }) as never,
    set: () => {},
  } satisfies InjectAuthInstance;

  beforeEach(() => {
    getSession.mockReset();
  });

  it('allows the session user whose DB email matches the configured operator (case-insensitive)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { drizzle } = drizzleReturningRows([{ email: 'Admin@Example.com' }]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).resolves.toBe(true);
  });

  it('rejects a generic ADMIN-named user whose email does not match (S4 判据已弃用)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u2' } });
    const { drizzle } = drizzleReturningRows([{ email: 'someone-else@example.com' }]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when no user row is found', async () => {
    getSession.mockResolvedValue({ user: { id: 'ghost' } });
    const { drizzle } = drizzleReturningRows([]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator email is not configured', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { drizzle } = drizzleReturningRows([{ email: 'admin@example.com' }]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith(''),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator themselves is suspended (S6 · FR-10 platform layer)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { drizzle } = drizzleReturningRows([{ email: 'admin@example.com' }]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(true),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 401 when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const { drizzle } = drizzleReturningRows([{ email: 'admin@example.com' }]);
    const guard = new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('queries the email scoped to the session user id', async () => {
    getSession.mockResolvedValue({ user: { id: 'u9' } });
    const { drizzle, where } = drizzleReturningRows([{ email: 'admin@example.com' }]);
    await new PlatformOperatorGuard(
      authInstance,
      drizzle,
      configWith('admin@example.com'),
      userStatusMock(),
    ).canActivate(ctxWith({}));
    expect(where.mock.calls[0][0]).toEqual(eq(user.id, 'u9'));
  });
});
