import { ConfigService } from '@app/config/config.service';
import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { UserStatusService } from '@app/tenancy/lifecycle/user-status.service';
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
 * 平台级权限守卫（FR-11 三层之顶层 · FR-13 · S5 正式判据）。
 *
 * 全局唯一 Platform Operator = 会话用户的 **DB email 命中 `platform.operatorEmail` 配置**
 * （开发者设定 · seed 保障该行存在 · 不可自助注册 / 不由他人任命）。泛 `role=ADMIN` 不再
 * 持有平台权（S4 过渡判据已收敛）。email 据实读 DB（非依赖 session 回传字段），fail-closed：
 * 无会话 401 · 未配置 / 不命中 / 查无此人 403。变更经营者 = 开发者改配置（FR-13，无互任机制）。
 *
 * S6 · FR-10/FR-11①：经营者自身亦为用户，若被暂停则平台层访问同样 fail-closed（纵深防御·
 * 与 session 硬删互补，防重登绕过）。
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  constructor(
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(UserStatusService) private readonly userStatus: UserStatusService,
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

    // FR-10: a suspended platform user loses platform-layer access too.
    if (await this.userStatus.isBlocked(String(userId)))
      throw new ForbiddenException('Account suspended');

    const operatorEmail = this.config.getPlatformConfig().operatorEmail?.trim().toLowerCase();
    if (!operatorEmail) throw new ForbiddenException('Platform operator not configured');

    const rows = await this.drizzle.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, String(userId)))
      .limit(1);
    const email = rows[0]?.email?.toLowerCase();
    if (!email || email !== operatorEmail) throw new ForbiddenException('Platform operator only');
    return true;
  }
}
