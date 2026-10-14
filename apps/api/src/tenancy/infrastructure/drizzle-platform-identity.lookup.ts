import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import type { PlatformIdentityLookup } from '@core/saas-kit/tenancy/platform/platform-identity.port';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

/**
 * `PlatformIdentityLookup` 的 Drizzle 适配（参考应用侧·§9.5.4①B）：据实读 Better Auth
 * 的 `user.email`（非 session 回传字段）。core 经端口消费、不感知此实现。
 */
@Injectable()
export class DrizzlePlatformIdentityLookup implements PlatformIdentityLookup {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async emailOf(userId: string): Promise<string | undefined> {
    const rows = await this.drizzle.db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return rows[0]?.email;
  }
}
