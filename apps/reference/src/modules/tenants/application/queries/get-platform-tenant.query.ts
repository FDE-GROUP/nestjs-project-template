import { BaseQuery } from '@core/shared-kernel/cqrs/types';
import type { PlatformTenantRow } from '../read-models/platform-tenant.read-model';

/** 租户详情（FR-6·平台级读侧）：不存在 → null（控制层转 404）。 */
export class GetPlatformTenantQuery extends BaseQuery<PlatformTenantRow | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}
