import { ForbiddenException, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import { type TenantContext, tenantStorage } from './tenant-context';

/**
 * Accessor for the current request's tenant scope. Backed by AsyncLocalStorage so a
 * singleton can read the per-request store without request-scoping every consumer
 * (global-tenancy §9.3 / FR-2).
 *
 * S0 only exposes read access; the fail-closed enforcement guard (FR-5) lands in S2.
 */
@Injectable()
export class TenantContextService {
  /** Current tenant context, or undefined outside a resolved request scope. */
  get(): TenantContext | undefined {
    return tenantStorage.getStore();
  }

  /** Active tenant id (== organization id), or undefined when none is set. */
  get tenantId(): string | undefined {
    return tenantStorage.getStore()?.tenantId;
  }

  /**
   * Active workspace id (S3 · D2/§9.2), or undefined when the request carries no
   * `x-workspace-id` selector. Optional by design: it only NARROWS reads/writes within
   * the already-trusted tenant; it is never a security boundary on its own.
   */
  get workspaceId(): string | undefined {
    return tenantStorage.getStore()?.workspaceId;
  }

  /** Run `fn` within the given tenant context (used by the middleware / tests). */
  run<T>(ctx: TenantContext, fn: () => T): T {
    return tenantStorage.run(ctx, fn);
  }

  /** Fail-closed: require an active tenant, else 403. For tenant-scoped endpoints. */
  requireTenantId(): string {
    const tenantId = tenantStorage.getStore()?.tenantId;
    if (!tenantId)
      throw new ForbiddenException('Missing active tenant context', {
        errorCode: ERROR_CODES.TENANCY_NO_ACTIVE_CONTEXT,
      });
    return tenantId;
  }
}
