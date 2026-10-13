import type { TenantStatus } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { Injectable, Logger } from '@nestjs/common';

/** 平台级治理动作（FR-6 · S4/S5）：审批/驳回 + 暂停/恢复/删除。 */
export type PlatformTenantAction = 'approve' | 'reject' | 'suspend' | 'resume' | 'delete';

/**
 * 平台治理审计单点（FR-6 · S5）：跨租户治理动作的唯一日志卡点——所有 approve/reject/
 * suspend/resume/delete 均经此产出**结构化**日志（pino JSON 行，动作/租户/操作者/状态迁移
 * 逐字段可机读），禁 handler 散点手搓 logger.info。
 *
 * S5 采结构化日志口径（人裁）：不落新表 → 不触迁移；后续如需查询/导出再演进专用审计表。
 */
@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  /** 记录一次租户治理动作；`error` 携失败上下文（如非法迁移被拒）。 */
  logTenantGovernance(
    action: PlatformTenantAction,
    organizationId: string,
    operatorId: string,
    detail?: { from?: TenantStatus; to?: TenantStatus; error?: string },
  ): void {
    this.logger.log({
      audit: 'platform.tenant',
      action,
      organizationId,
      operatorId,
      from: detail?.from,
      to: detail?.to,
      error: detail?.error,
      at: new Date().toISOString(),
    });
  }
}
