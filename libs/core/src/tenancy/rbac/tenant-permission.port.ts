import type { TenantAction, TenantRole, TenantSubject } from './tenant-rules';

/**
 * 租户级权限裁决端口（global-tenancy §9.5.4①B 端口倒置 · module-rbac-casl §2.2 换形）。
 *
 * `TenantPermissionGuard` 声明所需授权（`@Can`），把「是否允许」的**实际裁决**委派给
 * 本端口——参考应用侧的 CASL 适配器（`infrastructure/casl-tenant-permission.checker`）
 * 从 `tenant-rules.ts` 单源投影建 ability 并判定。新宪（人裁 2026-10-17）：授权裁决归
 * CASL，Better Auth 只管认证；角色由会话解析点预注入 ALS（丙裁），本端口只消费标量输入，
 * core 不 import 认证/CASL 实现。
 */

export const TENANT_PERMISSION_CHECKER = Symbol('TENANT_PERMISSION_CHECKER');

export interface TenantPermissionCheck {
  /** ALS 预注入的活动租户成员角色；undefined = 无租户/封禁/词汇外（适配侧必拒）。 */
  readonly role?: TenantRole;
  readonly action: TenantAction;
  readonly subject: TenantSubject;
}

export interface TenantPermissionChecker {
  /**
   * 纯裁决：是否放行。同步签名——裁决输入已全部预注入（不再透传 headers 回查认证运行时）；
   *  deny 由守卫落 403（fail-closed）。
   */
  can(check: TenantPermissionCheck): boolean;
}
