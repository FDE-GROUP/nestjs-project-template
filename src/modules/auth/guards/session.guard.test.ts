import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InjectAuthInstance } from '../auth.interface';
import { SessionGuard } from './session.guard';

function ctxWith(headers: Record<string, string>): ExecutionContext {
  const req: { headers: Record<string, string>; sessionUser?: { id: string; email: string } } = {
    headers,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('SessionGuard (PIPL · C1)', () => {
  const getSession = vi.fn();
  const authInstance = {
    get: () => ({ api: { getSession } }) as never,
    set: () => {},
  } satisfies InjectAuthInstance;

  let guard: SessionGuard;
  beforeEach(() => {
    getSession.mockReset();
    guard = new SessionGuard(authInstance);
  });

  it('passes and attaches sessionUser when session resolves', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' }, session: {} });
    const ctx = ctxWith({ cookie: 'session=abc' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ sessionUser?: { id: string; email: string } }>();
    expect(req.sessionUser).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(getSession).toHaveBeenCalledWith({ headers: { cookie: 'session=abc' } });
  });

  it('throws 401 when session is null', async () => {
    getSession.mockResolvedValue(null);
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 500-style Unauthorized when auth instance not yet initialized', async () => {
    const coldGuard = new SessionGuard({ get: () => undefined as never, set: () => {} });
    await expect(coldGuard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
