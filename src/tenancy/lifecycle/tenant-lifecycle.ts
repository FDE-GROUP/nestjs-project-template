/**
 * 租户生命周期状态机（FR-1 · 方案 §9.4）·纯函数·零框架依赖。
 *
 * 状态存 `organization.metadata.status`（jsonb·§9 提案已接受「审批状态存 metadata」，
 * 不引入独立列/表 → S4 不触迁移）。S4 落地 `pending_approval → active`（审批制准入）；
 * `suspended`/`deleted` 迁移由 S5/S6（经营者治理·fail-closed 暂停）驱动，此处先行定义。
 */
export const TENANT_STATUS = {
  PENDING: 'pending_approval',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
} as const;

export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS];

const ALL_STATUSES: readonly string[] = Object.values(TENANT_STATUS);

/** 从 org metadata（jsonb 真对象·容错 JSON 串）读出合法状态；缺失/非法 → undefined。 */
export function readTenantStatus(metadata: unknown): TenantStatus | undefined {
  let value = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const status = (value as Record<string, unknown>).status;
  return typeof status === 'string' && ALL_STATUSES.includes(status)
    ? (status as TenantStatus)
    : undefined;
}

/** 合并写回 metadata（保留其余键·approve/reject/暂停统一经此卡点，禁散点手搓对象）。 */
export function withTenantStatus(metadata: unknown, status: TenantStatus): Record<string, unknown> {
  let value = metadata;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }
  const base =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { ...base, status };
}

/**
 * fail-closed 生效判定（FR-1/NFR-1）：仅显式 `active` 视同生效——
 * 未知状态/无 metadata/查无此行一律失能（pending 租户零业务面）。
 */
export function isTenantActive(metadata: unknown): boolean {
  return readTenantStatus(metadata) === TENANT_STATUS.ACTIVE;
}

/**
 * 拦截判定（S4 中间件失能卡点·deny-list 语义）：仅显式处于
 * `pending_approval` / `suspended` / `deleted` 时拦截。**无状态记录 → 不拦**
 * （兼容存量/seeded org·避免锁定既有 dev 租户）。新申请经申请端点显式打
 * `pending_approval` → 天然失能，FR-1 闭环不受存量影响。
 */
export function isTenantBlocked(metadata: unknown): boolean {
  const status = readTenantStatus(metadata);
  return (
    status === TENANT_STATUS.PENDING ||
    status === TENANT_STATUS.SUSPENDED ||
    status === TENANT_STATUS.DELETED
  );
}

/**
 * 合法迁移表（§9.4 · S5 收紧）：
 * - pending_approval → active（审批通过）/ deleted（删除 pending）
 * - active → suspended（暂停）/ deleted（软删）；active → active 保留（审批幂等重提）
 * - suspended → active（恢复）/ deleted；deleted 终态（硬删留运维）
 * 无状态记录（存量/seeded）按 active 对待（与中间件 deny-list 同口径）。
 */
const TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  [TENANT_STATUS.PENDING]: [TENANT_STATUS.ACTIVE, TENANT_STATUS.DELETED],
  [TENANT_STATUS.ACTIVE]: [TENANT_STATUS.ACTIVE, TENANT_STATUS.SUSPENDED, TENANT_STATUS.DELETED],
  [TENANT_STATUS.SUSPENDED]: [TENANT_STATUS.ACTIVE, TENANT_STATUS.DELETED],
  [TENANT_STATUS.DELETED]: [],
};

/** 迁移是否合法（from 缺省视同 active；终态 deleted 不接受任何迁移）。 */
export function canTransition(from: TenantStatus | undefined, to: TenantStatus): boolean {
  return TRANSITIONS[from ?? TENANT_STATUS.ACTIVE].includes(to);
}
