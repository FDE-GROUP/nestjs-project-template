import type {
  TenantPermissionCheck,
  TenantPermissionChecker,
} from '@core/saas-kit/tenancy/rbac/tenant-permission.port';
import type { TenantRole } from '@core/saas-kit/tenancy/rbac/tenant-rules';
import { Injectable } from '@nestjs/common';
import { buildTenantAbility, type TenantCaslAbility } from './casl-ability.factory';

/**
 * `TenantPermissionChecker` 的 CASL 适配（module-rbac-casl §2.2 · 新宪裁决引擎）。
 *
 * 规则零内置：全部来自 `tenant-rules.ts` 单源的按角色投影（`buildTenantAbility`）。
 * 投影对同一角色幂等且不可变 → 按角色记忆 ability，免每请求重建。
 * 无角色（ALS 未注入 = 无租户/封禁/词汇外）直接 deny——fail-closed 双保险。
 */
const abilityByRole = new Map<TenantRole, TenantCaslAbility>();

function abilityFor(role: TenantRole): TenantCaslAbility {
  let ability = abilityByRole.get(role);
  if (!ability) {
    ability = buildTenantAbility(role);
    abilityByRole.set(role, ability);
  }
  return ability;
}

@Injectable()
export class CaslTenantPermissionChecker implements TenantPermissionChecker {
  can(check: TenantPermissionCheck): boolean {
    const { role, action, subject } = check;
    if (!role) return false;
    return abilityFor(role).can(action, subject);
  }
}
