import { BaseQuery } from '@core/shared-kernel/cqrs/types';
import type { TenantDataExport } from '../read-models/tenant-data-export.read-model';

/** 按租户导出全部名下数据（NFR-6·平台级读侧）；不存在 → null（404）。deleted 终态亦可导。 */
export class ExportTenantDataQuery extends BaseQuery<TenantDataExport | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}
