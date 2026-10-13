import type { ConfigService } from '@app/config/config.service';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { UserStatusService } from '@app/tenancy/lifecycle/user-status.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformIdentityLookup } from './platform-identity.port';
import { PlatformOperatorGuard } from './platform-operator.guard';

function ctxWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

/**
 * 桩 `PlatformIdentityLookup`（§9.5.4①B）：email 命中→返回该 email；查无此人→undefined。
 */
function identityReturning(email: string | undefined) {
  const emailOf = vi.fn(async (_userId: string) => email);
  return { identity: { emailOf } as unknown as PlatformIdentityLookup, emailOf };
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
    const { identity } = identityReturning('Admin@Example.com');
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).resolves.toBe(true);
  });

  it('rejects a generic ADMIN-named user whose email does not match (S4 判据已弃用)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u2' } });
    const { identity } = identityReturning('someone-else@example.com');
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when no user row is found', async () => {
    getSession.mockResolvedValue({ user: { id: 'ghost' } });
    const { identity } = identityReturning(undefined);
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator email is not configured', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith(''),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator themselves is suspended (S6 · FR-10 platform layer)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } });
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(true),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 401 when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('looks up the email scoped to the session user id', async () => {
    getSession.mockResolvedValue({ user: { id: 'u9' } });
    const { identity, emailOf } = identityReturning('admin@example.com');
    await new PlatformOperatorGuard(
      authInstance,
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    ).canActivate(ctxWith({}));
    expect(emailOf).toHaveBeenCalledWith('u9');
  });
});
