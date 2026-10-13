import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

/**
 * 平台级权限守卫（FR-11 三层之顶层 · FR-13 · S4 过渡判据）。
 *
 * 认证会话用户 + `users.role === 'ADMIN'`（roleEnum）方放行执行平台级动作（审批/驳回等跨租户
 * 治理）；否则 403。据实读 DB 的 role（非依赖 session 回传字段），fail-closed。
 *
 * ⚠️ S4 阶段为「过渡判据」：仍以既有 `roleEnum.ADMIN` 为准。S5 将 seed **全局唯一** Platform
 * Operator（FR-13·不可自助注册 / 不由他人任命）并正式化平台级裁决，届时本守卫收敛为经营者身份判定。
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const auth = this.authInstance.get();
    if (!auth) throw new UnauthorizedException('Auth instance not initialized');

    const result = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    const userId = result?.user?.id;
    if (!userId) throw new UnauthorizedException('Missing or invalid session');

    const rows = await this.drizzle.db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, String(userId)))
      .limit(1);
    if (rows[0]?.role !== 'ADMIN') throw new ForbiddenException('Platform operator only');
    return true;
  }
}
