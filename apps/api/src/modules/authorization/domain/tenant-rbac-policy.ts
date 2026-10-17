import { SYSTEM_ROLE_KEYS } from '@core/saas-kit/authorization/tenant-rules';

/**
 * 租户 RBAC 写侧策略纯函数（domain · module-rbac-dynamic-roles §2.2 conditions 白名单 / S1 判据）。
 *
 * 零依赖零 IO：自定义角色 key 的词法闸 + grant `conditions` 的形状闸。
 * 写路径（仓储适配器）先过闸再落行——**闸外形状一律拒**（fail-closed），投影侧
 * （CASL matcher）因此只需信任库内形状；读侧无需二次防御。
 */

/** 自定义角色 key 词法：小写字母数字开头 + `-`/`_`，≤64（防怪值、与系统 key/BA 内部值区分）。 */
const ROLE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** 字段名词法：单词字符（mongo 等值匹配的左端；`$` 运算符键在白名单期直接拒·见下）。 */
const FIELD_PATTERN = /^\w{1,64}$/;

export function isReservedRoleKey(key: string): boolean {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}

/** 合法自定义角色 key = 词法过闸 ∧ 非系统保留 key（系统三行由 lazy-ensure 独占）。 */
export function isValidRoleKey(key: string): boolean {
  return ROLE_KEY_PATTERN.test(key) && !isReservedRoleKey(key);
}

/**
 * conditions 白名单（S1 期）：**平铺等值对象**——键为字段名（`\w`），值为原始量
 * （string/number/boolean/null）。`'{{userId}}'` 形模板串合法（S4 建 ability 前解析为实值）。
 * 拒绝：空对象（语义含混·要整 subject 级就传 null）、数组、嵌套对象（mongo 运算符
 * `$in/$gt` 等——S4 扩白名单时再放，闸先紧后松防旁逸）、函数/undefined（JSON 不可达值）。
 */
export function isValidGrantConditions(conditions: unknown): conditions is Record<string, unknown> {
  if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) {
    return false;
  }
  const entries = Object.entries(conditions);
  if (entries.length === 0) return false;
  for (const [field, value] of entries) {
    if (!FIELD_PATTERN.test(field)) return false;
    // `$` 前缀字段名已被 FIELD_PATTERN 拒；此处再锁值面原始量类型。
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      return false;
    }
  }
  return true;
}

/** revoke/grant 等值比较口径：JSON 规范化串（键序稳定化后比较·同格多条件行的精确撤除依据）。 */
export function canonicalConditions(conditions: Record<string, unknown> | null): string {
  if (conditions === null) return 'null';
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(conditions).sort()) sorted[key] = conditions[key];
  return JSON.stringify(sorted);
}
