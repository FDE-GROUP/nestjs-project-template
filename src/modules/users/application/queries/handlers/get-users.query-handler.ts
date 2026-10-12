import { DrizzleService } from '@app/database/drizzle.service';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { type UserReadModel, userPublicColumns } from '../../read-models/user.read-model';
import { GetUsersQuery } from '../get-users.query';

/**
 * Read side bypasses the domain and queries the write store directly (pragmatic CQRS).
 */
@QueryHandler(GetUsersQuery)
export class GetUsersQueryHandler implements IQueryHandler<GetUsersQuery, UserReadModel[]> {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async execute(): Promise<UserReadModel[]> {
    return this.drizzle.db.query.user.findMany({ columns: userPublicColumns }) as Promise<
      UserReadModel[]
    >;
  }
}
