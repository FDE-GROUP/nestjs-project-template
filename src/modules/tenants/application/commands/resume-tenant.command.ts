import { BaseCommand } from '@app/shared-kernel/cqrs/types';
import type { TenantApplicationReadModel } from '../read-models/tenant-application.read-model';

/**
 * 平台级动作（FR-11①·FR-6）：经营者恢复被暂停租户 → `suspended → active`（§9.4 迁移表）。
 * 非法迁移（如从未暂停）→ 409；不存在 → null（404）。`operatorId` 供结构化审计。
 */
export class ResumeTenantCommand extends BaseCommand<TenantApplicationReadModel | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}
