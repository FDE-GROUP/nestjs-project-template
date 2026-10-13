import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { describe, expect, it, vi } from 'vitest';
import type { TenantStatusService } from './lifecycle/tenant-status.service';
import { TenantMiddleware } from './tenant.middleware';
import { type TenantContext, tenantStorage } from './tenant-context';

function makeMiddleware(opts: {
  activeOrganizationId?: string;
  userId?: string;
  blocked?: boolean | 'throw';
}) {
  const getSession = vi.fn().mockResolvedValue({
    session: { activeOrganizationId: opts.activeOrganizationId },
    user: { id: opts.userId ?? 'u1' },
  });
  const authInstance = {
    get: () => ({ api: { getSession } }) as never,
    set: () => {},
  } as unknown as InjectAuthInstance;

  const isBlocked =
    opts.blocked === 'throw'
      ? vi.fn().mockRejectedValue(new Error('db down'))
      : vi.fn().mockResolvedValue(opts.blocked ?? false);
  const status = { isBlocked } as unknown as TenantStatusService;

  return { mw: new TenantMiddleware(authInstance, status), isBlocked };
}

function reqWith(headers: Record<string, unknown> = {}) {
  return { headers: { cookie: 'session=abc', ...headers }, url: '/api/v1/posts' };
}

async function run(mw: TenantMiddleware, req: unknown): Promise<TenantContext | undefined> {
  let store: TenantContext | undefined;
  await new Promise<void>((resolve) => {
    mw.use(req, {}, () => {
      store = tenantStorage.getStore();
      // Let the middleware's internal promise chain settle before reading isBlocked results.
      resolve();
    });
  });
  // The context is bound synchronously inside tenantStorage.run(next), so `store` is set.
  return store;
}

describe('TenantMiddleware · S4 approval fail-closed (deny-list)', () => {
  it('binds NO tenant when the active tenant is blocked (pending/suspended/deleted)', async () => {
    const { mw, isBlocked } = makeMiddleware({ activeOrganizationId: 'orgP', blocked: true });
    const store = await run(mw, reqWith());
    expect(isBlocked).toHaveBeenCalledWith('orgP');
    expect(store?.tenantId).toBeUndefined();
    expect(store?.userId).toBe('u1'); // user-level identity still resolved
  });

  it('binds the tenant when it is not blocked (active / legacy unrecorded)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith());
    expect(store?.tenantId).toBe('orgA');
  });

  it('fails closed when the status lookup throws', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: 'throw' });
    const store = await run(mw, reqWith());
    expect(store?.tenantId).toBeUndefined();
  });

  it('skips the status read entirely when no tenant is resolved', async () => {
    const { mw, isBlocked } = makeMiddleware({});
    const store = await run(mw, reqWith());
    expect(isBlocked).not.toHaveBeenCalled();
    expect(store?.tenantId).toBeUndefined();
  });

  it('still narrows by the x-workspace-id selector within the active tenant (S3)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith({ 'x-workspace-id': 'ws7' }));
    expect(store?.tenantId).toBe('orgA');
    expect(store?.workspaceId).toBe('ws7');
  });
});
