import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthInstanceInjectKey } from '../auth.constant';
import type { InjectAuthInstance } from '../auth.interface';

/**
 * Shape of an authenticated principal attached to the request by SessionGuard.
 * Kept intentionally narrow — only the fields the PIPL /users/me/* endpoints need.
 */
export interface SessionUser {
  id: string;
  email: string;
}

/**
 * Minimal request shape SessionGuard reads/writes. Avoids coupling to a specific
 * HTTP adapter (Fastify vs Express); Nest's `switchToHttp()` supplies a compatible object.
 */
export interface SessionRequest {
  headers: Record<string, string | string[] | undefined>;
  sessionUser?: SessionUser;
}

/**
 * Resolves the Better Auth session from the incoming request headers.
 * Attaches `req.sessionUser` on success; otherwise throws 401.
 *
 * Used by PIPL-scoped endpoints (C1 · FR-7). Deliberately NOT applied to
 * legacy `POST /users` / `GET /users` to avoid an unrelated contract break.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SessionRequest>();
    const auth = this.authInstance.get();
    if (!auth) throw new UnauthorizedException('Auth instance not initialized');

    const result = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!result?.user?.id) throw new UnauthorizedException('Missing or invalid session');

    req.sessionUser = { id: String(result.user.id), email: String(result.user.email ?? '') };
    return true;
  }
}
