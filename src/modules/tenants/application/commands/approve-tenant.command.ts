import { BaseCommand } from '@app/shared-kernel/cqrs/types';
import type { TenantApplicationReadModel } from '../read-models/tenant-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者审批通过 → 租户 `pending_approval → active`。
 * 返回迁移后的回执；目标租户不存在 → null（控制层转 404）。跨租户治理，不受 TenantScope 约束。
 */
export class ApproveTenantCommand extends BaseCommand<TenantApplicationReadModel | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}
