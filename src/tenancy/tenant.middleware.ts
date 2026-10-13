import { AUTH_BYPASS_PATHS, AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { TenantStatusService } from './lifecycle/tenant-status.service';
import { UserStatusService } from './lifecycle/user-status.service';
import { type TenantContext, tenantStorage } from './tenant-context';

/**
 * Resolves the active tenant for each request and binds it to AsyncLocalStorage
 * (global-tenancy §9.3 / FR-2). Reads `session.activeOrganizationId` from the same
 * Better Auth session that `SessionGuard` uses (D4 session-cookie) — no JWT claims
 * involved. Downstream guards / services read it via `TenantContextService`.
 *
 * Cheap-path: public / auth / health routes (and any request without a session
 * cookie) pass straight through, so this adds a session lookup only where one can
 * exist. Failures degrade to "no tenant" rather than throwing (enforcement is S2).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    @Inject(AuthInstanceInjectKey)
    private readonly authInstance: InjectAuthInstance,
    @Inject(TenantStatusService)
    private readonly tenantStatus: TenantStatusService,
    @Inject(UserStatusService)
    private readonly userStatus: UserStatusService,
  ) {}

  use(req: any, _res: any, next: () => void): void {
    const url = (req?.originalUrl || req?.url || '') as string;
    // No session cookie, or it's an auth / bypass route → nothing to resolve.
    if (
      !req?.headers?.cookie ||
      AUTH_BYPASS_PATHS.some((p) => url.includes(p)) ||
      url.includes('/auth')
    ) {
      next();
      return;
    }

    const auth = this.authInstance.get();
    if (!auth) {
      next();
      return;
    }

    auth.api
      .getSession({ headers: req.headers as Headers })
      .then(
        (
          result: { session?: { activeOrganizationId?: string }; user?: { id?: string } } | null,
        ) => {
          const tenantId = result?.session?.activeOrganizationId ?? undefined;
          const userId = result?.user?.id ? String(result.user.id) : undefined;
          // S3 · workspace 二级边界 (D2/§9.2): the active workspace is a per-request
          // selector read from the `x-workspace-id` header (header may override — §9.2).
          // OPTIONAL: absent → request runs at tenant scope. Cross-tenant safety never
          // depends on this value — the repository always ANDs the trusted `tenantId`;
          // the workspace only narrows within the tenant (workspace 间互不可见).
          const wsHeader = req?.headers?.['x-workspace-id'];
          const workspaceId =
            typeof wsHeader === 'string' && wsHeader.length > 0 ? wsHeader : undefined;

          const bind = (boundTenantId: string | undefined, boundUserId?: string): void => {
            const ctx: TenantContext = {
              tenantId: boundTenantId,
              workspaceId,
              userId: boundUserId,
            };
            tenantStorage.run(ctx, next);
          };

          // S6 · FR-10 (deny-list · 用户层失能): a platform-suspended user binds neither a
          // tenant nor an identity → every downstream guard (tenant / user / platform layer)
          // fails closed. Checked before tenant resolution because suspension is global
          // (all tenants) — defense-in-depth alongside session hard-invalidation.
          const userCheck = userId ? this.userStatus.isBlocked(userId) : Promise.resolve(false);
          return userCheck.then((userBlocked) => {
            if (userBlocked) {
              bind(undefined, undefined);
              return;
            }
            // S4 · FR-1 审批制失能卡点 (deny-list): a tenant explicitly pending approval /
            // suspended / deleted binds NO tenantId → downstream TenantScopeGuard fails
            // closed (403) on business routes. No status recorded (legacy/seeded) → allowed,
            // so existing dev tenants are never locked. Async: only pay the extra read when
            // a tenant is actually resolved.
            if (!tenantId) {
              bind(undefined, userId);
              return;
            }
            return this.tenantStatus
              .isBlocked(tenantId)
              .then((blocked) => bind(blocked ? undefined : tenantId, userId))
              .catch(() => bind(undefined, userId)); // fail-closed: unresolvable status → no tenant
          });
        },
      )
      .catch((err: Error) => {
        this.logger.warn(`tenant context skipped: ${err.message}`);
        next();
      });
  }
}
