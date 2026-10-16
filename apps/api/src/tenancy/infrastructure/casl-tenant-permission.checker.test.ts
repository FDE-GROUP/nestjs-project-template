import type { TenantPermissionChecker } from '@core/saas-kit/tenancy/rbac/tenant-permission.port';
import { describe, expect, it } from 'vitest';
import { CaslTenantPermissionChecker } from './casl-tenant-permission.checker';

/**
 * CASL 裁决适配（module-rbac-casl §2.2）的端口形状测：
 * 判定语义由工厂矩阵锁测穷尽覆盖，此处只锁适配层自身的两条契约——
 * 无角色必拒（fail-closed）与按角色委派投影（含跨角色缓存一致性）。
 */
describe('CaslTenantPermissionChecker', () => {
  const checker: TenantPermissionChecker = new CaslTenantPermissionChecker();

  it('无角色（ALS 未注入）一律 deny，不触规则表', () => {
    expect(checker.can({ action: 'read', subject: 'Workspace' })).toBe(false);
    expect(checker.can({ role: undefined, action: 'read', subject: 'Workspace' })).toBe(false);
  });

  it('按角色委派 tenant-rules 投影：owner 全权 / member 仅 Workspace 读', () => {
    expect(checker.can({ role: 'owner', action: 'delete', subject: 'Organization' })).toBe(true);
    expect(checker.can({ role: 'member', action: 'read', subject: 'Workspace' })).toBe(true);
    expect(checker.can({ role: 'member', action: 'create', subject: 'Workspace' })).toBe(false);
  });

  it('重复判定同角色返回一致结果（ability 按角色记忆·投影幂等）', () => {
    const first = checker.can({ role: 'admin', action: 'update', subject: 'Organization' });
    const second = checker.can({ role: 'admin', action: 'update', subject: 'Organization' });
    expect(second).toBe(first);
    expect(first).toBe(true);
  });
});
