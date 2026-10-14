import { DrizzleService } from '@app/database/drizzle.service';
import { session } from '@app/database/schema';
import { USER_STATUS, UserStatusService } from '@core/tenancy/lifecycle/user-status.service';
import { PlatformAuditService } from '@core/tenancy/platform/platform-audit.service';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import type { UserGovernanceResult } from '../../read-models/platform-user.read-model';
import { SuspendUserCommand } from '../suspend-user.command';

/**
 * 暂停平台用户（FR-10/FR-6·平台级）：`active → suspended` 经 `UserStatusService.transition`
 * 严格裁决（§9.4 迁移表·非法 → 409·不存在 → null 转 404）。成功后**硬删该用户全部 session 行**
 * （D4 session 模式即时失权·§159）→ 当前请求立刻 401；deny-list 守卫作纵深防御拦重登。
 * 成败均落结构化审计（FR-6）。
 */
@CommandHandler(SuspendUserCommand)
export class SuspendUserCommandHandler implements ICommandHandler<SuspendUserCommand> {
  constructor(
    @Inject(UserStatusService) private readonly status: UserStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
  ) {}

  async execute(command: SuspendUserCommand): Promise<UserGovernanceResult | null> {
    const result = await this.status.transition(command.userId, USER_STATUS.SUSPENDED, {
      reason: command.reason,
      actorId: command.operatorId,
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      this.audit.logUserGovernance('suspend', command.userId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal user transition: ${result.from ?? 'active'} -> ${result.to}`,
      );
    }
    // FR-10 immediate global失权: invalidate every active session of the suspended user.
    await this.drizzle.db.delete(session).where(eq(session.userId, command.userId));
    this.audit.logUserGovernance('suspend', command.userId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { userId: command.userId, status: result.status };
  }
}
