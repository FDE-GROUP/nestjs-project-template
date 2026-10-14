import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '@core/shared-kernel/domain/event-publisher.port';
import { TenantRejectedEvent } from '@core/tenancy/lifecycle/events/tenant-rejected.event';
import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/tenancy/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/tenancy/platform/platform-audit.service';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  TENANT_PROVISIONING_REPOSITORY,
  type TenantProvisioningRepository,
} from '../../../domain/repositories/tenant-provisioning.repository';
import { RejectTenantCommand } from '../reject-tenant.command';

/**
 * 驳回申请（FR-1·平台级）：硬删 pending 组织行（FK 级联清 member/invitation·pending 期零业务
 * 数据）。S5 收紧：仅显式 `pending_approval` 可驳回——已生效/无状态存量 → 409（生效租的暂停/
 * 删除走治理端点），目标不存在 → false（控制层转 404）。成败均经 PlatformAuditService 落
 * 结构化审计（FR-6）。
 * ES 第四切片：硬删成功（removed=true）后产出 `tenant.rejected` 耐久事件——org 行物理
 * 消失后这是「存在过并被驳回」的唯一痕迹（shadow append·not-found/409 零发·失败连带 500）。
 */
@CommandHandler(RejectTenantCommand)
export class RejectTenantCommandHandler implements ICommandHandler<RejectTenantCommand> {
  constructor(
    @Inject(TENANT_PROVISIONING_REPOSITORY)
    private readonly provisioning: TenantProvisioningRepository,
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    // S9 教训：显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: RejectTenantCommand): Promise<boolean> {
    const current = await this.status.read(command.organizationId);
    // 仅显式 pending 可驳回。read 对「不存在/无状态存量」均返回 undefined，无法在此区分：
    // 非 pending 的已知名（active/suspended 等）直接 409；undefined 交给 remove 谓词裁决
    //（命中 0 行 → false → 控制层 404；驳回路径 以 pending 为唯一合法域，FR-1 语义）。
    if (current !== undefined && current !== TENANT_STATUS.PENDING) {
      this.audit.logTenantGovernance('reject', command.organizationId, command.operatorId, {
        from: current,
        error: 'not_pending',
      });
      throw new ConflictException(`Only pending applications can be rejected (status: ${current})`);
    }
    const removed = await this.provisioning.remove(command.organizationId);
    if (removed) {
      await this.events.publishAll([
        new TenantRejectedEvent({
          aggregateId: command.organizationId,
          payload: { actorId: command.operatorId },
        }),
      ]);
    }
    this.audit.logTenantGovernance('reject', command.organizationId, command.operatorId, {
      from: removed ? TENANT_STATUS.PENDING : current,
      to: TENANT_STATUS.DELETED,
      error: removed ? undefined : 'not_found',
    });
    return removed;
  }
}
