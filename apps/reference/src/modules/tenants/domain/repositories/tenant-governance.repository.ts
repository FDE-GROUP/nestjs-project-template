import type { TenantStatus } from '@core/tenancy/lifecycle/tenant-lifecycle';

/**
 * Platform governance repository port (domain-owned · global-tenancy S5 · FR-6).
 *
 * 跨租户运营视图的唯一数据卡点：仅经 `PlatformOperatorGuard` 裁决后的平台级查询/治理
 * 使用——**刻意不做租户过滤**（平台级天然跨租户，FR-11①），因此该 port 绝不允许被
 * 租户级切片引用（守卫在 controller 逐路由接线，fail-closed）。
 *
 * 状态迁移（suspend/resume/delete）不在此 port——统一走 `TenantStatusService.transition`
 * （metadata 单点·§9.4 迁移表）；此处只保留行级读与硬删（deleted 终态后的运维硬删留接口）。
 */
export const TENANT_GOVERNANCE_REPOSITORY = Symbol('TENANT_GOVERNANCE_REPOSITORY');

export interface PlatformTenantRow {
  organizationId: string;
  name: string;
  slug: string;
  /** 无状态记录（存量/seeded）视同 active（与 canTransition/middleware deny-list 同口径）。 */
  status: TenantStatus;
  createdAt: Date;
}

export interface PlatformTenantPage {
  items: PlatformTenantRow[];
  total: number;
  limit: number;
  offset: number;
}

/** 按租户诊断（FR-6）：租户行 + 关联数据量，供经营者一眼判断租户实况。 */
export interface TenantDiagnostics {
  tenant: PlatformTenantRow;
  memberCount: number;
  invitationCount: number;
  workspaceCount: number;
  postCount: number;
}

export interface TenantGovernanceRepository {
  /** 跨租户列表（name/slug 模糊过滤·createdAt 倒序·limit/offset 分页）。 */
  list(opts: { limit: number; offset: number; search?: string }): Promise<PlatformTenantPage>;
  /** 租户详情；不存在 → null（调用方转 404）。 */
  findById(organizationId: string): Promise<PlatformTenantRow | null>;
  /** 按租户诊断（成员/邀请/workspace/帖子计数）；不存在 → null。 */
  diagnostics(organizationId: string): Promise<TenantDiagnostics | null>;
}
