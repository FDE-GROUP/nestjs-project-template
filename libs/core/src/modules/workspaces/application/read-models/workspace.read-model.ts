import type { WorkspaceRecord } from '../../domain/repositories/workspace.repository';

/**
 * Read-model projection for tenant-scoped workspace queries (CQRS read side).
 * Mirrors the persisted row; kept distinct so the public shape can diverge from storage.
 */
export interface WorkspaceReadModel extends WorkspaceRecord {}
