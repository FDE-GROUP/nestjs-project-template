import type {
  TenantRbacRepository,
  TenantRoleGrantView,
} from '@app/modules/authorization/domain/repositories/tenant-rbac.repository';
import { TENANT_RBAC_REPOSITORY } from '@app/modules/authorization/domain/repositories/tenant-rbac.repository';
import type {
  TenantPermissionCheck,
  TenantPermissionChecker,
  TenantPermissionInvalidator,
} from '@core/saas-kit/authorization/tenant-permission.port';
import { Inject, Injectable } from '@nestjs/common';
import { buildTenantAbility, type TenantCaslAbility } from './casl-ability.factory';

/** 缓存条目：per-(org,key) 的授权事实源（grants）+ 派生的类型级 ability（守卫热路径复用·免重建）。 */
interface CachedEntry {
  readonly grants: readonly TenantRoleGrantView[];
  readonly typeLevel: TenantCaslAbility;
}

const USER_TEMPLATE = '{{userId}}';

/**
 * 解析 grant conditions 里的 `{{userId}}` 模板为当前操作者实值（S4 check 级）。
 * 无 userId（未登录/未透传）→ 保留字面模板，CASL mongo 等值匹配必然落空 → 保守 deny（fail-closed）。
 * 值面只处理字符串（写侧策略闸已锁 conditions 为平铺原始量）。
 */
function resolveConditions(
  conditions: Record<string, unknown> | null,
  userId?: string,
): Record<string, unknown> | null {
  if (conditions === null || userId === undefined) return conditions;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(conditions)) {
    out[field] =
      typeof value === 'string' && value.includes(USER_TEMPLATE)
        ? value.split(USER_TEMPLATE).join(userId)
        : value;
  }
  return out;
}

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
 * over-grant 防线（S2·类型级）：守卫热路径（`can` 不带 `resource`）用**仅含 conditions=null 行**的
 * 类型级 ability——CASL v7 类型级 `can(action, subject)` 不下推 conditions，纳入会静默升为全量放行。
 * S4（check 级·乙裁）：当 `check.resource` 存在时走**实例判定**——纳入全部 grant 行、把 `{{userId}}`
 * 模板按 `check.userId` 解析为实值后携 `__caslSubjectType__` 交 CASL mongo 匹配；query 级列表过滤仍缓账。
 */
@Injectable()
export class CaslTenantPermissionChecker
  implements TenantPermissionChecker, TenantPermissionInvalidator
{
  constructor(@Inject(TENANT_RBAC_REPOSITORY) private readonly rbac: TenantRbacRepository) {}

  /** `(org,key)` 复合键 → 在途/已决投影 Promise（防并发重入·加载失败即时淘汰）。 */
  private readonly abilities = new Map<string, Promise<CachedEntry>>();

  async can(check: TenantPermissionCheck): Promise<boolean> {
    const { organizationId, role, action, subject } = check;
    // fail-closed：无租户上下文 / 无角色 → 直拒，不触规则源。
    if (!organizationId || !role) return false;
    const cacheKey = `${organizationId}\u0000${role}`;
    try {
      const entry = await this.entryFor(cacheKey, organizationId, role);
      // 守卫路径（不带 resource）：类型级判定·复用缓存 ability·conditions 行保守 deny（S2 防线）。
      if (check.resource === undefined) {
        return entry.typeLevel.can(action, subject);
      }
      // 实例路径（check 级·S4）：纳入全部 grant 行·按操作者解析 {{userId}} 后交 CASL mongo 匹配。
      const instance = buildTenantAbility(
        entry.grants.map((g) => ({
          subject: g.subject,
          action: g.action,
          conditions: resolveConditions(g.conditions ?? null, check.userId),
        })),
      );
      return instance.can(action, { __caslSubjectType__: subject, ...check.resource });
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

  private entryFor(
    cacheKey: string,
    organizationId: string,
    roleKey: string,
  ): Promise<CachedEntry> {
    let pending = this.abilities.get(cacheKey);
    if (!pending) {
      pending = this.buildEntry(organizationId, roleKey);
      this.abilities.set(cacheKey, pending);
    }
    return pending;
  }

  private async buildEntry(organizationId: string, roleKey: string): Promise<CachedEntry> {
    await this.rbac.ensureSystemRoles(organizationId);
    // 查无角色（null）与零授权（[]）同归空 grants → 类型级/实例级投影皆落空 → 全拒（fail-closed 双保险）。
    const grants = (await this.rbac.findGrants(organizationId, roleKey)) ?? [];
    // 类型级投影：over-grant 防线——conditions 行（conditions≠null）不入类型级 ability。
    const typeLevel = buildTenantAbility(grants.filter((g) => (g.conditions ?? null) === null));
    return { grants, typeLevel };
  }
}
