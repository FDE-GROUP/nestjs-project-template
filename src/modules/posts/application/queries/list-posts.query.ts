import { BaseQuery } from '@app/shared-kernel/cqrs/types';
import type { PostReadModel } from '../read-models/post.read-model';

/** List posts within the active tenant (no tenant arg — scope is enforced downstream). */
export class ListPostsQuery extends BaseQuery<PostReadModel[]> {}
