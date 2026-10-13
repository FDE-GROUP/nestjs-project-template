import { TENANT_STATUS, type TenantStatus } from '@app/tenancy/lifecycle/tenant-lifecycle';
import { TenantStatusService } from '@app/tenancy/lifecycle/tenant-status.service';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { TenantApplicationReadModel } from '../../read-models/tenant-application.read-model';
import { ApproveTenantCommand } from '../approve-tenant.command';

/**
 * 审批通过（FR-1·平台级）：`pending_approval → active`，经 `TenantStatusService.transition`
 * 统一写回 `organization.metadata`（禁散点手搓对象）。目标租户不存在 → null（控制层转 404）。
 */
@CommandHandler(ApproveTenantCommand)
export class ApproveTenantCommandHandler implements ICommandHandler<ApproveTenantCommand> {
  constructor(@Inject(TenantStatusService) private readonly status: TenantStatusService) {}

  async execute(command: ApproveTenantCommand): Promise<TenantApplicationReadModel | null> {
    const next: TenantStatus | null = await this.status.transition(
      command.organizationId,
      TENANT_STATUS.ACTIVE,
    );
    return next ? { organizationId: command.organizationId, status: next } : null;
  }
}
