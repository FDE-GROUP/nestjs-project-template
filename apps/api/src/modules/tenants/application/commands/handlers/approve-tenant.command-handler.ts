import { TENANT_STATUS } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/tenancy/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/tenancy/platform/platform-audit.service';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { ApproveTenantCommand } from '../approve-tenant.command';

/**
 * 审批通过（FR-1·平台级）：`pending_approval → active`，经 `TenantStatusService.transition`
 * 统一写回 `organization.metadata`（禁散点手搓对象·S5 起按迁移表严格裁决）。
 * 目标租户不存在 → null（控制层 404）；非法迁移（如已 deleted）→ 409。
 * 成功经 `PlatformAuditService` 产出结构化审计（FR-6·动作/租户/操作者/状态迁移）。
 */
@CommandHandler(ApproveTenantCommand)
export class ApproveTenantCommandHandler implements ICommandHandler<ApproveTenantCommand> {
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: ApproveTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await this.status.transition(command.organizationId, TENANT_STATUS.ACTIVE, {
      actorId: command.operatorId,
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      this.audit.logTenantGovernance('approve', command.organizationId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
      );
    }
    this.audit.logTenantGovernance('approve', command.organizationId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { organizationId: command.organizationId, status: result.status };
  }
}
