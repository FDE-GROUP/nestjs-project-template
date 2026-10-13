import { AUTH_BYPASS_PATHS, AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
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
          const ctx: TenantContext = {
            tenantId: result?.session?.activeOrganizationId ?? undefined,
            userId: result?.user?.id,
          };
          tenantStorage.run(ctx, next);
        },
      )
      .catch((err: Error) => {
        this.logger.warn(`tenant context skipped: ${err.message}`);
        next();
      });
  }
}
