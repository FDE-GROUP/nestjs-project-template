import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { createSeatsQuotaPlugin, type SeatsQuotaHookDeps } from './seats-quota.hook';

/** 假 invitation 查询链（drizzle select().from().where().limit() 形态的最小面）。 */
function fakeDb(rows: Array<{ organizationId: string; status: string }>) {
  const select = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  }));
  return { select, db: { select } as unknown as SeatsQuotaHookDeps['db'] };
}

function makeDeps(opts: {
  rows?: Array<{ organizationId: string; status: string }>;
  verdict?: { ok: boolean; used: number; limit: number };
}) {
  const { select, db } = fakeDb(opts.rows ?? []);
  const checkSeats = vi.fn().mockResolvedValue(opts.verdict ?? { ok: true, used: 1, limit: 5 });
  const deps: SeatsQuotaHookDeps = {
    db,
    quota: { checkSeats } as unknown as SeatsQuotaHookDeps['quota'],
  };
  return { deps, select, checkSeats };
}

function getHook(deps: SeatsQuotaHookDeps) {
  const plugin = createSeatsQuotaPlugin(deps);
  const hook = plugin.hooks?.before?.[0];
  if (!hook) throw new Error('seats-quota plugin before-hook missing');
  return hook as unknown as {
    matcher: (ctx: { path?: string }) => boolean;
    handler: (ctx: { path?: string; body?: unknown }) => Promise<unknown>;
  };
}

/** 执行 handler 并捕获抛错（APIError 实例断言需拿原始对象查 status）。 */
async function captureError(
  handler: (ctx: { path?: string; body?: unknown }) => Promise<unknown>,
  ctx: { path?: string; body?: unknown },
): Promise<unknown> {
  try {
    await handler(ctx);
    return null;
  } catch (error) {
    return error;
  }
}

describe('seats-quota plugin hook（S7 收尾·BA 成员增量配额接线）', () => {
  describe('matcher 命中面', () => {
    const { deps } = makeDeps({});
    const { matcher } = getHook(deps);

    it('命中 accept-invitation（现网唯一真实入组通道）与防御预留字面量', () => {
      expect(matcher({ path: '/organization/accept-invitation' })).toBe(true);
      expect(matcher({ path: '/organization/add-member' })).toBe(true);
      expect(matcher({ path: '/organization/add-team-member' })).toBe(true);
    });

    it('不命中非成员增量端点（宁漏勿误伤）', () => {
      expect(matcher({ path: '/organization/remove-member' })).toBe(false);
      expect(matcher({ path: '/organization/update-member-role' })).toBe(false);
      expect(matcher({ path: '/organization/invite-member' })).toBe(false);
      expect(matcher({ path: '/organization/list-members' })).toBe(false);
      expect(matcher({ path: '/sign-in/email' })).toBe(false);
      expect(matcher({})).toBe(false);
    });
  });

  describe('handler 裁决面', () => {
    it('超限 → 402（S7 assertSeats 同口径错误体）', async () => {
      const { deps, checkSeats } = makeDeps({
        rows: [{ organizationId: 'org-1', status: 'pending' }],
        verdict: { ok: false, used: 5, limit: 5 },
      });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/accept-invitation',
        body: { invitationId: 'inv-1' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('org-1', 1);
    });

    it('未超限 → 放行', async () => {
      const { deps, checkSeats } = makeDeps({
        rows: [{ organizationId: 'org-1', status: 'pending' }],
        verdict: { ok: true, used: 2, limit: 5 },
      });
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-1' } }),
      ).resolves.not.toThrow();
      expect(checkSeats).toHaveBeenCalledWith('org-1', 1);
    });

    it('邀请不存在/已消费 → 放行交由 BA 自身错误路径（配额层不越权裁决）', async () => {
      const cases: Array<Array<{ organizationId: string; status: string }>> = [
        [],
        [{ organizationId: 'org-1', status: 'accepted' }],
      ];
      for (const rows of cases) {
        const { deps, checkSeats } = makeDeps({ rows });
        const { handler } = getHook(deps);
        await expect(
          handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-x' } }),
        ).resolves.not.toThrow();
        expect(checkSeats).not.toHaveBeenCalled();
      }
    });

    it('body 缺失/畸形 → 放行（不代 BA 做 400 裁决）', async () => {
      const { deps, checkSeats } = makeDeps({});
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: undefined }),
      ).resolves.not.toThrow();
      await expect(
        handler({ path: '/organization/accept-invitation', body: {} }),
      ).resolves.not.toThrow();
      expect(checkSeats).not.toHaveBeenCalled();
    });

    it('防御预留通道按 body.organizationId 裁决', async () => {
      const { deps, checkSeats } = makeDeps({ verdict: { ok: false, used: 5, limit: 5 } });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/add-member',
        body: { organizationId: 'org-9' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('org-9', 1);
      // 无 organizationId 的预留通道请求：放行（现网无此 HTTP 路由，server-only 调用不经 hook）
      await expect(handler({ path: '/organization/add-member', body: {} })).resolves.not.toThrow();
    });
  });
});
