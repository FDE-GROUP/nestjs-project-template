import { BaseQuery } from '@core/shared-kernel/cqrs/types';
import type { Page, PageRequest } from '@core/shared-kernel/domain/pagination';
import type { UserReadModel } from '../read-models/user.read-model';

export class GetUsersQuery extends BaseQuery<Page<UserReadModel>> {
  constructor(readonly request: PageRequest) {
    super();
  }
}
