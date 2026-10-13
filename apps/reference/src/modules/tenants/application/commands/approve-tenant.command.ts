import { BaseCommand } from '@core/shared-kernel/cqrs/types';
import type { TenantApplicationReadModel } from '../read-models/tenant-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者审批通过 → 租户 `pending_approval → active`。
 * 返回迁移后的回执；目标租户不存在 → null（控制层转 404）；非法迁移 → 409。
 * `operatorId` = 会话主体（PlatformOperatorGuard 已裁决平台权），供结构化审计，非请求体可伪造字段。
 */
export class ApproveTenantCommand extends BaseCommand<TenantApplicationReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}
