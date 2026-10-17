// S9 铁律：EVENT_STORE 为 Symbol token 必须值导入；EventStore 纯类型面可 import type

import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TENANT_STATUS } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  TENANT_GOVERNANCE_REPOSITORY,
  type TenantGovernanceRepository,
} from '../../../domain/repositories/tenant-governance.repository';
import {
  DeleteTenantPermanentlyCommand,
  type TenantHardDeleteResult,
} from '../delete-tenant-permanently.command';

/**
 * 硬删租户（NFR-6 删除半·FR-6·平台级）：前置闸仅 `deleted` 终态可消灭（甲裁·两段式
 * 先软后硬，误删 active 无回退路径）；**先补删 tenant 事件、后删主行**（顺序理由见
 * command 注释：补删失败 org 仍在可整请求重试；反序则 404 挡死形成不可重试孤儿事件）。
 * EVENT_STORE 直注不受 EVENT_PUBLISH_MODE 开关控制——表在就要清，PIPL 不留残迹
 *（同 user 硬删先例·S9 教训显式 @Inject + 值导入）。审计落 pino（库外幸存·乙裁）。
 */
@CommandHandler(DeleteTenantPermanentlyCommand)
export class DeleteTenantPermanentlyCommandHandler
  implements ICommandHandler<DeleteTenantPermanentlyCommand>
{
  constructor(
    @Inject(TENANT_GOVERNANCE_REPOSITORY)
    private readonly governance: TenantGovernanceRepository,
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: DeleteTenantPermanentlyCommand): Promise<TenantHardDeleteResult | null> {
    const existing = await this.governance.findById(command.organizationId);
    if (!existing) return null; // 不存在/已被硬删 → 404（幂等）
    if (existing.status !== TENANT_STATUS.DELETED) {
      this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
        from: existing.status,
        error: 'not_deleted_terminal',
      });
      throw new ConflictException(
        `Tenant ${command.organizationId} is not in deleted terminal state (current: ${existing.status}); soft-delete first`,
        { errorCode: ERROR_CODES.TENANCY_NOT_DELETED_TERMINAL },
      );
    }

    // ① 先补删事件（fail-loud：抛错则 org 仍在，可整请求重试）
    const purgedEvents = await this.eventStore.deleteByAggregate('tenant', command.organizationId);
    // ② 后删主行（FK cascade 灭五张子表）
    const destroyed = await this.governance.destroy(command.organizationId);
    if (!destroyed) {
      // 并发窗口：状态检查后被他人删除——事件已清、主行已没，幂等回 404 留审计
      this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
        from: TENANT_STATUS.DELETED,
        error: 'already_gone',
      });
      return null;
    }

    this.audit.logTenantGovernance('hard_delete', command.organizationId, command.operatorId, {
      from: TENANT_STATUS.DELETED,
    });
    return { organizationId: command.organizationId, purgedEvents };
  }
}
