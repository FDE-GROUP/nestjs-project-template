import { DrizzleService } from '@app/database/drizzle.service';
import { user, userStatus } from '@app/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { canTransition, TENANT_STATUS, type TenantStatus } from './tenant-lifecycle';

/**
 * 用户生命周期状态复用租户状态机的 active/suspended/deleted 子集
 * （pending 属租户准入语义，用户侧不产生）。
 */
export type UserStatus = TenantStatus;

export const USER_STATUS = {
  ACTIVE: TENANT_STATUS.ACTIVE,
  SUSPENDED: TENANT_STATUS.SUSPENDED,
  DELETED: TENANT_STATUS.DELETED,
} as const;

/** 严格迁移结果结合：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。 */
export type UserTransitionResult =
  | { kind: 'ok'; previous: UserStatus | undefined; status: UserStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: UserStatus | undefined; to: UserStatus };

/**
 * 用户状态读写唯一卡点（S6 · FR-10）：落独立表 `user_status`（不动 Better Auth 的
 * `user` 表·FK 级联删除）。deny-list 语义——无记录行视同 active（fail-open 仅限
 * “未被动过暂停”的常见态，与租户状态机同口径），仅显式 suspended/deleted 才失能。
 */
@Injectable()
export class UserStatusService {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  /** 读取用户当前生命周期状态；无记录行 → undefined（视同 active）。 */
  async read(userId: string): Promise<UserStatus | undefined> {
    const rows = await this.drizzle.db
      .select({ status: userStatus.status })
      .from(userStatus)
      .where(eq(userStatus.userId, userId))
      .limit(1);
    return rows[0]?.status as UserStatus | undefined;
  }

  /** 是否被拦（deny-list）：仅显式 suspended/deleted 为真；无行 → 不拦。 */
  async isBlocked(userId: string): Promise<boolean> {
    const status = await this.read(userId);
    return status === USER_STATUS.SUSPENDED || status === USER_STATUS.DELETED;
  }

  /**
   * 严格状态迁移：目标用户不存在 → not-found（转 404）；非法边 → illegal（转 409）；
   * 合法则 upsert `user_status` 并返回 previous 供审计。平台级动作专用（suspend/resume/delete），
   * 权限裁决归 PlatformOperatorGuard；session 硬删由调用方（治理 handler）叠加。
   */
  async transition(
    userId: string,
    to: UserStatus,
    opts?: { reason?: string },
  ): Promise<UserTransitionResult> {
    const exists = await this.drizzle.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!exists.length) return { kind: 'not-found' };

    const previous = await this.read(userId);
    if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to };

    const now = new Date();
    await this.drizzle.db
      .insert(userStatus)
      .values({ userId, status: to, reason: opts?.reason ?? null, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: userStatus.userId,
        set: { status: to, reason: opts?.reason ?? null, updatedAt: now },
      });
    return { kind: 'ok', previous, status: to };
  }
}
