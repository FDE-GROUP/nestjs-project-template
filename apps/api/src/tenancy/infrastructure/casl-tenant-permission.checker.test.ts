import type {
  TenantRbacRepository,
  TenantRoleGrantView,
} from '@app/modules/tenants/domain/repositories/tenant-rbac.repository';
import { describe, expect, it, vi } from 'vitest';
import { CaslTenantPermissionChecker } from './casl-tenant-permission.checker';

/**
 * CASL 裁决适配（module-rbac-dynamic-roles S2·DB 规则源落形）的行为测。
 * 锁 checker 自身契约（投影机制由工厂测·端口形状由守卫测分别覆盖）：
 *  ① fail-closed：无租户/无角色不触规则源；查无角色(null)/零授权([]) 皆 deny；
 *  ② lazy-ensure + 进程内缓存：miss 触发 ensure→findGrants，同 (org,key) 复用只查一次；
 *  ③ over-grant 防线：带 conditions 的 grant 行不参与类型级判定；
 *  ④ 跨租隔离：同 key 不同租户投影独立；
 *  ⑤ invalidateTenant 失效后重查（热改生效面）；
 *  ⑥ 加载失败 deny 且淘汰缓存（下次重试，绝不视同放行）。
 */

const grant = (
  subject: string,
  action: string,
  conditions: Record<string, unknown> | null = null,
) => ({ subject, action, conditions }) as unknown as TenantRoleGrantView;

function makeChecker(grantsFor: (org: string, key: string) => TenantRoleGrantView[] | null) {
  const ensureSystemRoles = vi.fn().mockResolvedValue(undefined);
  const findGrants = vi.fn(async (org: string, key: string) =>
    grantsFor(org, key),
  ) as unknown as ReturnType<typeof vi.fn>;
  const rbac = { ensureSystemRoles, findGrants } as unknown as TenantRbacRepository;
  return { checker: new CaslTenantPermissionChecker(rbac), ensureSystemRoles, findGrants };
}

describe('CaslTenantPermissionChecker（DB 规则源·S2）', () => {
  it('fail-closed：无租户 / 无角色直拒，不触规则源', async () => {
    const { checker, findGrants, ensureSystemRoles } = makeChecker(() => [
      grant('Workspace', 'read'),
    ]);
    await expect(
      checker.can({
        organizationId: undefined,
        role: 'member',
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
    await expect(
      checker.can({
        organizationId: 'orgA',
        role: undefined,
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
    expect(findGrants).not.toHaveBeenCalled();
    expect(ensureSystemRoles).not.toHaveBeenCalled();
  });

  it('lazy-ensure：miss 先补种系统角色再读授权', async () => {
    const { checker, ensureSystemRoles, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await expect(
      checker.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    expect(ensureSystemRoles).toHaveBeenCalledWith('orgA');
    expect(findGrants).toHaveBeenCalledWith('orgA', 'member');
  });

  it('进程内缓存：同 (org,key) 多判只查库一次', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await checker.can({
      organizationId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
    });
    await checker.can({
      organizationId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
    });
    expect(findGrants).toHaveBeenCalledTimes(1);
  });

  it('查无角色(null) 与零授权([]) 皆 deny', async () => {
    const ghost = makeChecker(() => null);
    await expect(
      ghost.checker.can({
        organizationId: 'orgA',
        role: 'editor',
        action: 'read',
        subject: 'Member',
      }),
    ).resolves.toBe(false);
    const empty = makeChecker(() => []);
    await expect(
      empty.checker.can({
        organizationId: 'orgA',
        role: 'editor',
        action: 'read',
        subject: 'Member',
      }),
    ).resolves.toBe(false);
  });

  it('over-grant 防线：条件行不入类型级判定·无整 subject 级行则类型级 deny', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'update', { ownerId: '{{userId}}' }),
    ]);
    // 仅有带条件行 → 类型级 can('update','Workspace') 必拒（否则静默升为全量放行）。
    await expect(
      checker.can({
        organizationId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
  });

  it('整 subject 级行（conditions=null）纳入类型级 allow', async () => {
    const { checker } = makeChecker(() => [grant('Organization', 'delete')]);
    await expect(
      checker.can({
        organizationId: 'orgA',
        role: 'owner',
        action: 'delete',
        subject: 'Organization',
      }),
    ).resolves.toBe(true);
  });

  it('跨租隔离：同 key 在不同租户投影独立', async () => {
    const { checker, findGrants } = makeChecker((org) =>
      org === 'orgA' ? [grant('Member', 'read')] : [],
    );
    await expect(
      checker.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    await expect(
      checker.can({ organizationId: 'orgB', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(findGrants).toHaveBeenCalledTimes(2); // 不同 org → 各自独立缓存条目
  });

  it('invalidateTenant 失效后重查（热改生效）', async () => {
    let phase = 1;
    const { checker, findGrants } = makeChecker(() =>
      phase === 1 ? [grant('Member', 'read')] : [],
    );
    const c = checker as CaslTenantPermissionChecker;
    await expect(
      c.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    phase = 2;
    // 未失效 → 命中缓存仍 true；失效 → 重查转为 [] → deny。
    await expect(
      c.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    c.invalidateTenant('orgA');
    await expect(
      c.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(findGrants).toHaveBeenCalledTimes(2);
  });

  it('加载失败：deny 且淘汰缓存（下次重试·绝不视同放行）', async () => {
    const ensureSystemRoles = vi.fn().mockRejectedValue(new Error('db down'));
    const findGrants = vi
      .fn()
      .mockResolvedValue([grant('Member', 'read')]) as unknown as ReturnType<typeof vi.fn>;
    const rbac = { ensureSystemRoles, findGrants } as unknown as TenantRbacRepository;
    const checker = new CaslTenantPermissionChecker(rbac);
    await expect(
      checker.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    // 淘汰后再次尝试 → 重新触发 ensure（失败仍 deny，但不会永久缓存 rejected Promise）。
    await expect(
      checker.can({ organizationId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(ensureSystemRoles).toHaveBeenCalledTimes(2);
  });
});
