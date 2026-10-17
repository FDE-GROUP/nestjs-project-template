import type { TenantRbacRepository } from '@app/modules/tenants/domain/repositories/tenant-rbac.repository';
import { TENANT_RBAC_REPOSITORY } from '@app/modules/tenants/domain/repositories/tenant-rbac.repository';
import type {
  TenantPermissionCheck,
  TenantPermissionChecker,
  TenantPermissionInvalidator,
} from '@core/saas-kit/tenancy/rbac/tenant-permission.port';
import { Inject, Injectable } from '@nestjs/common';
import { buildTenantAbility, type TenantCaslAbility } from './casl-ability.factory';

/**
 * `TenantPermissionChecker` 的 CASL 适配（module-rbac-casl §2.2 · module-rbac-dynamic-roles §2.3·S2 落形）。
 *
 * 新宪（丙裁）：**授权事实 SSOT 在 DB grant 行**——本类经 `TENANT_RBAC_REPOSITORY` 端口读
 * per-tenant 角色规则集，投影为 CASL ability 后判定，自身零内置权限知识。语义约束：
 *  - **lazy-ensure**：miss 时先 `ensureSystemRoles`（缺则补种三系统角色）再 `findGrants`；
 *  - **fail-closed**：无租户/无角色/查无角色（null）/零授权（[]）/加载抛错 → 恒 deny，绝不视同放行；
 *  - **进程内版本缓存**：同 (org,key) 记忆 ability（含在途 Promise 防并发重入），守卫热路径不逐请求查库；
 *    `invalidateTenant` 为热改生效面（S3 门面在 grant/revoke/create/delete 后调用）。
 *
 * over-grant 防线（S2 裁决）：**带 `conditions` 的 grant 行不参与类型级判定**——CASL v7 类型级
 * `can(action, subject)`（不带实例）不下推 conditions，若纳入则「带条件授权」在类型级静默升为全量放行；
 * conditions 行的消费推迟到 S4 实例判定（check 级），本片按 deny-from-type-level 保守投影。
 */
@Injectable()
export class CaslTenantPermissionChecker
  implements TenantPermissionChecker, TenantPermissionInvalidator
{
  constructor(@Inject(TENANT_RBAC_REPOSITORY) private readonly rbac: TenantRbacRepository) {}

  /** `(org,key)` 复合键 → 在途/已决 ability Promise（防并发重入·加载失败即时淘汰）。 */
  private readonly abilities = new Map<string, Promise<TenantCaslAbility>>();

  async can(check: TenantPermissionCheck): Promise<boolean> {
    const { organizationId, role, action, subject } = check;
    // fail-closed：无租户上下文 / 无角色 → 直拒，不触规则源。
    if (!organizationId || !role) return false;
    const cacheKey = `${organizationId}\u0000${role}`;
    try {
      const ability = await this.abilityFor(cacheKey, organizationId, role);
      return ability.can(action, subject);
    } catch {
      // 加载失败绝不视同放行：淘汰缓存以待下次重试，本次 deny（fail-closed）。
      this.abilities.delete(cacheKey);
      return false;
    }
  }

  /** 失效本租户全部角色投影（写侧热改生效面·实现 `TenantPermissionInvalidator`·S3 门面写后调用）。 */
  invalidateTenant(organizationId: string): void {
    const prefix = `${organizationId}\u0000`;
    for (const key of this.abilities.keys()) {
      if (key.startsWith(prefix)) this.abilities.delete(key);
    }
  }

  private abilityFor(
    cacheKey: string,
    organizationId: string,
    roleKey: string,
  ): Promise<TenantCaslAbility> {
    let pending = this.abilities.get(cacheKey);
    if (!pending) {
      pending = this.buildAbility(organizationId, roleKey);
      this.abilities.set(cacheKey, pending);
    }
    return pending;
  }

  private async buildAbility(organizationId: string, roleKey: string): Promise<TenantCaslAbility> {
    await this.rbac.ensureSystemRoles(organizationId);
    const grants = await this.rbac.findGrants(organizationId, roleKey);
    // 查无角色（null）与零授权（[]）同归空规则投影 → 全拒（fail-closed 双保险）。
    if (!grants || grants.length === 0) return buildTenantAbility([]);
    // over-grant 防线：条件行（conditions≠null）不入类型级 ability（留待 S4 实例判定消费）。
    return buildTenantAbility(grants.filter((g) => g.conditions === null));
  }
}
