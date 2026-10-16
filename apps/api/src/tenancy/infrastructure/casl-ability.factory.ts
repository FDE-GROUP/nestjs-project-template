import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import {
  TENANT_RULES,
  type TenantAction,
  type TenantRole,
  type TenantSubject,
} from '@core/saas-kit/tenancy/rbac/tenant-rules';

/**
 * tenant-rules 表（SSOT·core 侧）→ CASL ability 的**纯投影**（module-rbac-casl §2.2）。
 *
 * 本文件不含任何独立权限知识：规则全部来自 `TENANT_RULES[role]`，逐格 `can(actions, subject)`。
 * 未知角色投影为空规则 → 全部拒绝（fail-closed；守卫侧另有前置拦截，此为双保险）。
 * 实例级 conditions 留钩不引入（plan 非目标）：本片只做端点级 (action, subject) 裁决。
 */
export type TenantCaslAbility = MongoAbility<[TenantAction, TenantSubject]>;

export function buildTenantAbility(role: TenantRole): TenantCaslAbility {
  const { can, build } = new AbilityBuilder<[TenantAction, TenantSubject]>(createMongoAbility);
  const rules = TENANT_RULES[role];
  if (rules) {
    for (const subject of Object.keys(rules) as TenantSubject[]) {
      const actions = rules[subject];
      if (actions.length > 0) can([...actions] as TenantAction[], subject);
    }
  }
  return build();
}
