import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant scope (global-tenancy §9.3 / FR-2).
 * `tenantId` == the active organization id resolved from the Better Auth session
 * (`session.activeOrganizationId`, D4 session-cookie). `workspaceId` / `roles` are
 * filled by later slices (S3 workspace边界 / S1 RBAC); S0 only carries tenant + user.
 */
export interface TenantContext {
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();
