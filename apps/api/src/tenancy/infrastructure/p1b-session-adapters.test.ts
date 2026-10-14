import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionReader } from './auth-session.reader';
import { BetterAuthTenantPermissionChecker } from './ba-tenant-permission.checker';

/** `RequestSessionReader` 适配：封装 cookie/旁路短路 + Better Auth 会话解析。 */
describe('AuthSessionReader (P1b · 会话端口适配)', () => {
  function readerWith(session: unknown, opts: { noAuth?: boolean } = {}) {
    const getSession = vi.fn().mockResolvedValue(session);
    const authInstance = {
      get: () => (opts.noAuth ? undefined : ({ api: { getSession } } as never)),
      set: () => {},
    } as unknown as InjectAuthInstance;
    return { reader: new AuthSessionReader(authInstance), getSession };
  }

  it('returns null WITHOUT a session lookup for a request with no cookie', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await expect(reader.read({ headers: {}, url: '/posts' })).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('short-circuits bypass / health routes (no getSession)', async () => {
    const { reader, getSession } = readerWith({ user: { id: 'u1' } });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/api/v1/health' }),
    ).resolves.toBeNull();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('returns null when the auth instance is not initialized', async () => {
    const { reader } = readerWith({ user: { id: 'u1' } }, { noAuth: true });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toBeNull();
  });

  it('maps a resolved session to the scalar view (userId + activeOrganizationId)', async () => {
    const { reader } = readerWith({
      user: { id: 'u1' },
      session: { activeOrganizationId: 'org_1' },
    });
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toEqual({ userId: 'u1', activeOrganizationId: 'org_1' });
  });

  it('normalizes an unresolved session (null) to no tenant context', async () => {
    const { reader } = readerWith(null);
    await expect(
      reader.read({ headers: { cookie: 'session=abc' }, url: '/posts' }),
    ).resolves.toBeNull();
  });
});

/** `TenantPermissionChecker` 适配：把 BA `hasPermission` 的 `{ headers, body:{permissions} }` 形状封装在此。 */
describe('BetterAuthTenantPermissionChecker (P1b · RBAC 裁决适配)', () => {
  beforeEach(() => vi.clearAllMocks());

  function checkerWith(result: unknown, opts: { noAuth?: boolean } = {}) {
    const hasPermission = vi.fn().mockResolvedValue(result);
    const authInstance = {
      get: () => (opts.noAuth ? undefined : ({ api: { hasPermission } } as never)),
      set: () => {},
    } as unknown as InjectAuthInstance;
    return { checker: new BetterAuthTenantPermissionChecker(authInstance), hasPermission };
  }

  it('grants and wraps the permission map into the Better Auth body shape', async () => {
    const { checker, hasPermission } = checkerWith({ success: true });
    await expect(
      checker.hasPermission({ cookie: 'session=abc' }, { member: ['create'] }),
    ).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledWith({
      headers: { cookie: 'session=abc' },
      body: { permissions: { member: ['create'] } },
    });
  });

  it('returns false when Better Auth reports the permission is not satisfied', async () => {
    const { checker } = checkerWith({ success: false });
    await expect(checker.hasPermission({}, { organization: ['delete'] })).resolves.toBe(false);
  });

  it('fails closed (403) when the auth instance is not initialized', async () => {
    const { checker } = checkerWith(undefined, { noAuth: true });
    await expect(checker.hasPermission({}, { member: ['create'] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
