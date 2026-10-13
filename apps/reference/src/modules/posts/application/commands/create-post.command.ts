import { BaseCommand } from '@core/shared-kernel/cqrs/types';
import type { PostReadModel } from '../read-models/post.read-model';

/**
 * Write-side intent to create a tenant-owned post. Carries primitives only; the owning
 * tenant is NOT a field — it is stamped from the trusted context by the repository.
 */
export class CreatePostCommand extends BaseCommand<PostReadModel> {
  constructor(
    readonly title: string,
    readonly content?: string | null,
    readonly published?: boolean,
  ) {
    super();
  }
}
