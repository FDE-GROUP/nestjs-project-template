import type { Page, PageRequest } from '../../../../shared-kernel/domain/pagination';

/**
 * Workspace repository port (domain-owned, dependency inversion).
 *
 * A workspace is a sub-tenant grouping (global-tenancy D2 / §9.2). Like the post port it
 * deliberately exposes NO tenant parameter: the owning tenant (organizationId) is resolved
 * inside the adapter from the trusted AsyncLocalStorage context, so no caller can target a
 * foreign tenant. This is the single choke-point for workspace isolation (FR-5) — every read
 * filters and every write stamps `organizationId`; cross-tenant id access matches 0 rows.
 *
 * Note: workspace rows are the tenant-level grouping themselves, so scoping is by
 * `organizationId` only (the `x-workspace-id` selector narrows BUSINESS data like posts, not
 * the workspace catalogue).
 */
export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

/** Write intent for a new tenant-owned workspace (primitives only, never a DTO). */
export interface WorkspaceDraft {
  name: string;
  slug: string;
}

/** A persisted workspace row (includes its owning tenant for transparency). */
export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceRepository {
  /** Workspaces within the active tenant only（分页信封·Page<T> 契约与治理面同形）。 */
  list(request: PageRequest): Promise<Page<WorkspaceRecord>>;
  /** Creates a workspace stamped with the active tenant. */
  create(draft: WorkspaceDraft): Promise<WorkspaceRecord>;
  /** Updates a workspace ONLY if it belongs to the active tenant; null otherwise. */
  update(id: string, draft: Partial<WorkspaceDraft>): Promise<WorkspaceRecord | null>;
  /** Deletes a workspace ONLY if it belongs to the active tenant; false otherwise. */
  remove(id: string): Promise<boolean>;
}
