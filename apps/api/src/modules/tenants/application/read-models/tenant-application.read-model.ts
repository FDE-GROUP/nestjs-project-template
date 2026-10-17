import type { TenantStatus } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';

/**
 * Read-model projection for the tenant application/approval flow (CQRS read side).
 * Deliberately minimal: the caller only needs the tenant id + its lifecycle status.
 */
export interface TenantApplicationReadModel {
  organizationId: string;
  status: TenantStatus;
}
