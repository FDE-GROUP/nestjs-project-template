/**
 * Post repository port (domain-owned, dependency inversion).
 *
 * Deliberately exposes NO tenant/workspace parameter: the active tenant (and optional
 * workspace selector) is resolved inside the adapter from the trusted request context
 * (AsyncLocalStorage), so no caller can supply an arbitrary/foreign id. This is the single
 * choke-point for the compound `(tenant, workspace)` isolation (global-tenancy §9.3 / FR-5,
 * D2) — handlers never scatter `where organizationId/workspaceId` by hand.
 */
export const POST_REPOSITORY = Symbol('POST_REPOSITORY');

/** Write intent for a new tenant-owned post (primitives only, never a DTO). */
export interface PostDraft {
  title: string;
  content?: string | null;
  published?: boolean;
}

/** A persisted post row (includes its owning tenant for transparency). */
export interface PostRecord {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  organizationId: string | null;
  workspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostRepository {
  /** Posts within the active tenant only, newest first. */
  list(): Promise<PostRecord[]>;
  /** A single post within the active tenant, or null (never leaks another tenant's row). */
  findById(id: string): Promise<PostRecord | null>;
  /** Creates a post stamped with the active tenant. */
  create(draft: PostDraft): Promise<PostRecord>;
}
