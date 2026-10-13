import { DrizzleService } from '@app/database/drizzle.service';
import { member, tenantSubscription } from '@app/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import type { ActiveSubscriptionView, QuotaStore } from '../quota/quota.store';
import { SUBSCRIPTION_STATUS } from '../quota/tenant-plans';

/**
 * `QuotaStore` 的 Drizzle 适配（参考应用侧·§9.5.4①B）：读 `tenant_subscription` 生效行、
 * 数 `member`。core 经端口消费、不感知具体表。
 */
@Injectable()
export class DrizzleQuotaStore implements QuotaStore {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async currentActiveSubscription(tenantId: string): Promise<ActiveSubscriptionView | null> {
    const rows = await this.drizzle.db
      .select({
        plan: tenantSubscription.plan,
        seatsLimit: tenantSubscription.seatsLimit,
        providerCustomerId: tenantSubscription.providerCustomerId,
      })
      .from(tenantSubscription)
      .where(
        and(
          eq(tenantSubscription.tenantId, tenantId),
          eq(tenantSubscription.status, SUBSCRIPTION_STATUS.ACTIVE),
        ),
      )
      .orderBy(desc(tenantSubscription.periodStart))
      .limit(1);
    const row = rows[0];
    return row
      ? { plan: row.plan, seatsLimit: row.seatsLimit, providerCustomerId: row.providerCustomerId }
      : null;
  }

  async countMembers(tenantId: string): Promise<number> {
    const [{ value }] = await this.drizzle.db
      .select({ value: count() })
      .from(member)
      .where(eq(member.organizationId, tenantId));
    return Number(value);
  }
}
