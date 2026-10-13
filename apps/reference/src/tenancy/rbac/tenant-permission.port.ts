/**
 * 租户级权限裁决端口（global-tenancy §9.5.4①B · P1b 会话端口倒置）。
 *
 * `TenantPermissionGuard` 声明所需权限（`permissions.ts` 的 `toPermissionMap` 是 core-safe 纯函数），
 * 但把「是否允许」的**实际裁决**委派给本端口——Better Auth 的 `auth.api.hasPermission` 具体调用留在
 * 参考应用侧适配（`infrastructure/ba-tenant-permission.checker`）。角色→权限映射的唯一真源仍是 BA ac，
 * core 只是消费布尔结果，不 import 认证实现。
 */

export const TENANT_PERMISSION_CHECKER = Symbol('TENANT_PERMISSION_CHECKER');

export interface TenantPermissionChecker {
  /**
   * @param headers 入站请求头（适配侧透传给 BA 以解析会话）
   * @param permissions 已归组的 `{ resource: actions[] }`（由 core `toPermissionMap` 产出）
   * @returns 是否放行；缺权 / 非成员均返回 false（fail-closed 由守卫落 403）
   */
  hasPermission(
    headers: Record<string, string | string[] | undefined>,
    permissions: Record<string, string[]>,
  ): Promise<boolean>;
}
