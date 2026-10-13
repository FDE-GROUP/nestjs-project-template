import { BaseQuery } from '@app/shared-kernel/cqrs/types';
import type { TenantDiagnostics } from '../read-models/platform-tenant.read-model';

/** 按租户诊断（FR-6·平台级读侧）：租户行 + 关联计数；不存在 → null（404）。 */
export class GetTenantDiagnosticsQuery extends BaseQuery<TenantDiagnostics | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}
