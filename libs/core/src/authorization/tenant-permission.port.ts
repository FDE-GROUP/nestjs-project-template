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
 *
 * 形状扩展注记（dynamic-roles S4·乙裁「仅 check 级」·丁裁②契约）：
 *  - `resource` 可选——实例级判定的**逃生舱**：不带 = 类型级裁决（守卫路径·带 conditions 的行保守
 *    deny，承 S2 over-grant 防线）；带上 = 交出「先取资源再判」的应用层，适配侧纳入 conditions 行并按
 *    实例匹配（query 级列表过滤缓账另片）；
 *  - `userId` 可选——绑定 grant conditions 里的 `{{userId}}` 模板为当前操作者实值（缺省即模板不可解析 → 保守 deny）。
 */

export const TENANT_PERMISSION_CHECKER = Symbol('TENANT_PERMISSION_CHECKER');

export interface TenantPermissionCheck {
  /** ALS 活动租户（规则分区键）；undefined = 无租户上下文（适配侧必拒）。 */
  readonly organizationId?: string;
  /** ALS 预注入的活动租户成员角色 key（系统三 key 或自定义 key）；undefined = 无/封禁/非法值。 */
  readonly role?: TenantRole;
  readonly action: TenantAction;
  readonly subject: TenantSubject;
  /**
   * 实例级判定的资源快照（S4·check 级）。省略 = 类型级裁决（守卫路径·conditions 行保守 deny）；
   * 传入 = 适配侧携 `__caslSubjectType__=subject` 交 CASL mongo 匹配带条件的 grant 行。由应用层「先取资源再判」供给，
   * 不经全局守卫（守卫在资源加载前运行）。
   */
  readonly resource?: Record<string, unknown>;
  /** 绑定 grant conditions 中 `{{userId}}` 模板的当前操作者 id（实例级判定所需；缺省则模板不可解析 → 保守 deny）。 */
  readonly userId?: string;
}

export interface TenantPermissionChecker {
  /**
   * 纯裁决：是否放行。异步签名（S2·规则源 DB）——deny 由守卫落 403（fail-closed）；
   * 适配器对「查无角色/无租户/词汇外」恒拒，绝不因加载失败视同放行。
   */
  can(check: TenantPermissionCheck): Promise<boolean>;
}

/**
 * 租户授权投影失效端口（module-rbac-dynamic-roles §2.3·S3 热改生效面·丁裁②契约新增）。
 *
 * 读写分治：`TenantPermissionChecker` 是读侧裁决（守卫消费），本端口是**写侧缓存失效**
 * （管理门面消费）。角色/授权经仓储变更后，同租户的 ability 投影即过时——门面调用本方法
 * 淘汰该租户全部缓存条目，下一请求重新 lazy 投影（单实例内存自洽；多实例一致性留
 * Redis pub/sub 缓账·见 plan §3）。参考应用侧由同一 CASL 适配类兼实现两端口。
 */
export const TENANT_PERMISSION_INVALIDATOR = Symbol('TENANT_PERMISSION_INVALIDATOR');

export interface TenantPermissionInvalidator {
  /** 失效某租户的全部角色 ability 投影（同步·幂等·无对应缓存条目时为空操作）。 */
  invalidateTenant(organizationId: string): void;
}
