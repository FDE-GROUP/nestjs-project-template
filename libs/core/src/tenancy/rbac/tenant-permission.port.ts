import type { TenantAction, TenantRole, TenantSubject } from './tenant-rules';

/**
 * 租户级权限裁决端口（global-tenancy §9.5.4①B · module-rbac-casl §2.2 换形 ·
 * module-rbac-dynamic-roles §2.3 契约修订·丁裁②）。
 *
 * `TenantPermissionGuard` 声明所需授权（`@Can`），把「是否允许」的**实际裁决**委派给
 * 本端口——参考应用侧的 CASL 适配器从**租户的 DB grant 行**（`tenant_role_grant`·授权事实
 * SSOT·丙裁）投影建 ability 并判定。新宪（人裁 2026-10-17）：授权裁决归 CASL，Better Auth
 * 只管认证；角色由会话解析点预注入 ALS（丙裁），core 不 import 认证/CASL/仓储实现。
 *
 * 形状修订注记（dynamic-roles S2）：
 *  - `organizationId` 入参——规则是 per-tenant 事实，同 key 角色在不同租户投影可不同；
 *  - `can` 异步——规则源为 DB（miss 时懒加载 + ensure 系统角色；命中走进程内版本缓存，
 *    守卫热路径不逐请求查库）。
 */

export const TENANT_PERMISSION_CHECKER = Symbol('TENANT_PERMISSION_CHECKER');

export interface TenantPermissionCheck {
  /** ALS 活动租户（规则分区键）；undefined = 无租户上下文（适配侧必拒）。 */
  readonly organizationId?: string;
  /** ALS 预注入的活动租户成员角色 key（系统三 key 或自定义 key）；undefined = 无/封禁/非法值。 */
  readonly role?: TenantRole;
  readonly action: TenantAction;
  readonly subject: TenantSubject;
}

export interface TenantPermissionChecker {
  /**
   * 纯裁决：是否放行。异步签名（S2·规则源 DB）——deny 由守卫落 403（fail-closed）；
   * 适配器对「查无角色/无租户/词汇外」恒拒，绝不因加载失败视同放行。
   */
  can(check: TenantPermissionCheck): Promise<boolean>;
}
