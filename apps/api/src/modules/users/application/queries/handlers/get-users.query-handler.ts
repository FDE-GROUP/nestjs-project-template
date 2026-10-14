import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import { createPage, type Page } from '@core/shared-kernel/domain/pagination';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { sql } from 'drizzle-orm';
import { type UserReadModel, userPublicColumns } from '../../read-models/user.read-model';
import { GetUsersQuery } from '../get-users.query';

/**
 * Read side bypasses the domain and queries the write store directly (pragmatic CQRS).
 */
@QueryHandler(GetUsersQuery)
export class GetUsersQueryHandler implements IQueryHandler<GetUsersQuery, Page<UserReadModel>> {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetUsersQuery): Promise<Page<UserReadModel>> {
    const request = query.request;
    // 与治理面同款两发：rows（limit/offset）然后 count，createPage 收口（用户面天然全表·无租户 scoping）
    const rows = (await this.drizzle.db.query.user.findMany({
      columns: userPublicColumns,
      limit: request.limit,
      offset: request.offset,
    })) as UserReadModel[];
    const [{ count }] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(user);
    return createPage(rows, count, request);
  }
}
