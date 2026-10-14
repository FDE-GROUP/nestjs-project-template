import { AUTH_BYPASS_PATHS, AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { resolveRequestSession } from '@app/modules/auth/session-resolver';
import type {
  RequestSessionReader,
  SessionRequestLike,
  SessionView,
} from '@core/saas-kit/tenancy/session/request-session.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `RequestSessionReader` 的参考应用侧适配（§9.5.4①B · P1b）。
 *
 * 把「廉价短路（无 cookie / 旁路 / auth 路由 → 不触发会话查询）」与 Better Auth 会话解析
 * （`resolveRequestSession`·`WeakMap` 按请求记忆·跨守卫复用一次 getSession）封装在应用侧，
 * 仅向 core 透出标量 `SessionView`。auth 实例经全局 `AuthInstanceInjectKey` 注入（`AuthModule.forRoot`
 * 声明 `global: true`）。会话未解析出（null）归一为「无租户上下文」返回 null。
 */
@Injectable()
export class AuthSessionReader implements RequestSessionReader {
  constructor(@Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance) {}

  async read(req: SessionRequestLike): Promise<SessionView | null> {
    const url = (req?.originalUrl || req?.url || '') as string;
    // 廉价路径：无 cookie / 认证 / 旁路 / health 路由 → 不做任何会话查询。
    if (
      !req?.headers?.cookie ||
      AUTH_BYPASS_PATHS.some((p) => url.includes(p)) ||
      url.includes('/auth')
    ) {
      return null;
    }

    const auth = this.authInstance.get();
    if (!auth) return null;

    const result = await resolveRequestSession(
      auth,
      req as { headers: Record<string, string | string[] | undefined> },
    );
    if (!result) return null;

    const userId = result.user?.id ? String(result.user.id) : undefined;
    const activeOrganizationId = result.session?.activeOrganizationId ?? undefined;
    return { userId, activeOrganizationId };
  }
}
