import { BaseQuery } from '@app/shared-kernel/cqrs/types';
import type { UserReadModel } from '../read-models/user.read-model';

export class GetUsersQuery extends BaseQuery<UserReadModel[]> {}
