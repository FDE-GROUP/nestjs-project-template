import { BaseQuery } from '@core/shared-kernel/cqrs/types';
import type { UserDataExportReadModel } from '../read-models/user-data-export.read-model';

/**
 * PIPL right-to-access: aggregate all personal data related to the given user
 * into a single portable JSON payload (C1 · FR-7).
 */
export class ExportUserDataQuery extends BaseQuery<UserDataExportReadModel> {
  constructor(readonly userId: string) {
    super();
  }
}
