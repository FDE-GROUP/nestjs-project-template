import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { ResumeTenantCommand } from '../resume-tenant.command';

/**
 * 恢复租户（FR-6·平台级）：`suspended → active`，经 `TenantStatusService.transition` 严格裁决
 * （§9.4 迁移表·非法 → 409·不存在 → null 转 404）；撤销中间件 deny-list 失能。落结构化审计。
 */
@CommandHandler(ResumeTenantCommand)
export class ResumeTenantCommandHandler implements ICommandHandler<ResumeTenantCommand> {
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: ResumeTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await this.status.transition(command.organizationId, TENANT_STATUS.ACTIVE, {
      actorId: command.operatorId,
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      this.audit.logTenantGovernance('resume', command.organizationId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
        { errorCode: ERROR_CODES.TENANCY_ILLEGAL_TRANSITION },
      );
    }
    this.audit.logTenantGovernance('resume', command.organizationId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { organizationId: command.organizationId, status: result.status };
  }
}
