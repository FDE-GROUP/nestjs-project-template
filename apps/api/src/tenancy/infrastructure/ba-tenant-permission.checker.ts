import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { TenantPermissionChecker } from '@core/tenancy/rbac/tenant-permission.port';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';

/**
 * `TenantPermissionChecker` 的参考应用侧适配（§9.5.4①B · P1b）。
 *
 * 把租户级 RBAC 的实际裁决落到 Better Auth 的组织 access control（`auth.api.hasPermission`）——
 * 角色→权限映射的唯一真源（禁散点特判）。core 守卫只交出归组后的 `{ resource: actions[] }` 并消费
 * 布尔结果；BA 特有的 `{ headers, body: { permissions } }` 请求形状封装在此。auth 未初始化 → 403
 * （与原守卫语义一致·fail-closed）。
 */
@Injectable()
export class BetterAuthTenantPermissionChecker implements TenantPermissionChecker {
  constructor(@Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance) {}

  async hasPermission(
    headers: Record<string, string | string[] | undefined>,
    permissions: Record<string, string[]>,
  ): Promise<boolean> {
    const auth = this.authInstance.get();
    if (!auth) throw new ForbiddenException('Auth instance not initialized');
    // BA 返回 `{ success: boolean }`（非成员时附 `error` 信封）；两种结果均归一为布尔供守卫裁决。
    const result = await auth.api.hasPermission({
      headers: headers as unknown as Headers,
      body: { permissions },
    });
    return Boolean(result?.success);
  }
}
