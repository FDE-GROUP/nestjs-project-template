import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { Page, PageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import type { PostReadModel } from '../read-models/post.read-model';

/** List posts within the active tenant (no tenant arg — scope is enforced downstream). */
export class ListPostsQuery extends BaseQuery<Page<PostReadModel>> {
  constructor(readonly request: PageRequest) {
    super();
  }
}
