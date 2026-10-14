import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { POST_REPOSITORY, type PostRepository } from '../../../domain/repositories/post.repository';
import type { PostReadModel } from '../../read-models/post.read-model';
import { ListPostsQuery } from '../list-posts.query';

/**
 * Read side goes through the repository port, which enforces the tenant scope
 * (global-tenancy §9.3 / FR-5). The handler itself is tenant-agnostic by design.
 */
@QueryHandler(ListPostsQuery)
export class ListPostsQueryHandler implements IQueryHandler<ListPostsQuery, Page<PostReadModel>> {
  constructor(@Inject(POST_REPOSITORY) private readonly posts: PostRepository) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPostsQuery): Promise<Page<PostReadModel>> {
    return this.posts.list(query.request) as Promise<Page<PostReadModel>>;
  }
}
