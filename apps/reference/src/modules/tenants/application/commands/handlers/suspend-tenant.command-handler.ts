import { TENANT_STATUS } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@app/tenancy/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@app/tenancy/platform/platform-audit.service';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { SuspendTenantCommand } from '../suspend-tenant.command';

/**
 * 暂停租户（FR-6/FR-10·平台级）：`active → suspended`，经 `TenantStatusService.transition`
 * 严格裁决（§9.4 迁移表·非法 → 409·不存在 → null 转 404），metadata 单点写回；
 * 中间件 deny-list 使该租户业务面即时失能。成败均落结构化审计（FR-6）。
 */
@CommandHandler(SuspendTenantCommand)
export class SuspendTenantCommandHandler implements ICommandHandler<SuspendTenantCommand> {
  constructor(
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async execute(command: SuspendTenantCommand): Promise<TenantApplicationReadModel | null> {
    const result = await this.status.transition(command.organizationId, TENANT_STATUS.SUSPENDED);
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      this.audit.logTenantGovernance('suspend', command.organizationId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal tenant transition: ${result.from ?? 'active'} -> ${result.to}`,
      );
    }
    this.audit.logTenantGovernance('suspend', command.organizationId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { organizationId: command.organizationId, status: result.status };
  }
}
