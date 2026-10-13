import type { PostRecord } from '../../domain/repositories/post.repository';

/**
 * Read-model projection for tenant-scoped post queries (CQRS read side).
 * Currently mirrors the persisted row; kept as a distinct type so the public shape can
 * diverge from storage without touching the repository.
 */
export interface PostReadModel extends PostRecord {}
