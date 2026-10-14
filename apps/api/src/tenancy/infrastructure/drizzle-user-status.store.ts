import { DrizzleService } from '@app/database/drizzle.service';
import { user, userStatus } from '@app/database/schema';
import type { UserStatusStore } from '@core/saas-kit/tenancy/lifecycle/user-status.store';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

/**
 * `UserStatusStore` 的 Drizzle 适配（参考应用侧·§9.5.4①B）：落独立表 `user_status`
 * （不动 Better Auth 的 `user` 表·FK 级联删除）。core 经端口消费、不感知此实现。
 */
@Injectable()
export class DrizzleUserStatusStore implements UserStatusStore {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async readStatus(userId: string): Promise<string | undefined> {
    const rows = await this.drizzle.db
      .select({ status: userStatus.status })
      .from(userStatus)
      .where(eq(userStatus.userId, userId))
      .limit(1);
    return rows[0]?.status;
  }

  async userExists(userId: string): Promise<boolean> {
    const rows = await this.drizzle.db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return rows.length > 0;
  }

  async upsert(userId: string, status: string, reason: string | null): Promise<void> {
    const now = new Date();
    await this.drizzle.db
      .insert(userStatus)
      .values({ userId, status, reason, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: userStatus.userId,
        set: { status, reason, updatedAt: now },
      });
  }
}
