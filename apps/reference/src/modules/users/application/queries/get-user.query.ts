import { BaseQuery } from '@app/shared-kernel/cqrs/types';
import type { UserReadModel } from '../read-models/user.read-model';

export class GetUserQuery extends BaseQuery<UserReadModel> {
  constructor(readonly id: string) {
    super();
  }
}
