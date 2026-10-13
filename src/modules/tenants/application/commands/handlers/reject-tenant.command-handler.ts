import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  TENANT_PROVISIONING_REPOSITORY,
  type TenantProvisioningRepository,
} from '../../../domain/repositories/tenant-provisioning.repository';
import { RejectTenantCommand } from '../reject-tenant.command';

/**
 * 驳回申请（FR-1·平台级）：硬删 pending 组织行（FK 级联清 member/invitation·pending 期零业务
 * 数据）。目标不存在 → false（控制层转 404）。生效租户的删除属 S5 经营者治理，不在此路径。
 */
@CommandHandler(RejectTenantCommand)
export class RejectTenantCommandHandler implements ICommandHandler<RejectTenantCommand> {
  constructor(
    @Inject(TENANT_PROVISIONING_REPOSITORY)
    private readonly provisioning: TenantProvisioningRepository,
  ) {}

  async execute(command: RejectTenantCommand): Promise<boolean> {
    return this.provisioning.remove(command.organizationId);
  }
}
