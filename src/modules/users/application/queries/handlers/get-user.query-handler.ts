import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import { Inject, NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import { type UserReadModel, userPublicColumns } from '../../read-models/user.read-model';
import { GetUserQuery } from '../get-user.query';

@QueryHandler(GetUserQuery)
export class GetUserQueryHandler implements IQueryHandler<GetUserQuery, UserReadModel> {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: GetUserQuery): Promise<UserReadModel> {
    const found = (await this.drizzle.db.query.user.findFirst({
      where: eq(user.id, query.id),
      columns: userPublicColumns,
    })) as UserReadModel | undefined;

    if (!found) {
      throw new NotFoundException(`User with ID ${query.id} not found`);
    }
    return found;
  }
}
