import { randomUUID } from 'node:crypto';
import { DrizzleService } from '@app/database/drizzle.service';
import { tenantSubscription } from '@app/database/schema';
import { SUBSCRIPTION_STATUS } from '@core/tenancy/quota/tenant-plans';
import { TenantContextService } from '@core/tenancy/tenant-context.service';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type {
  SubscriptionDraft,
  SubscriptionRecord,
  SubscriptionRepository,
} from '../../domain/repositories/subscription.repository';

/**
 * Drizzle-backed subscription repository — the tenant-scoped write/read choke-point for
 * `tenant_subscription` (global-tenancy S7 · FR-7/FR-8). The owning tenant is resolved from
 * the trusted AsyncLocalStorage context via `requireTenantId()` (fail-closed → 403 when none
 * is bound); every write stamps it and every read filters by it, so a foreign tenant cannot
 * be targeted (FR-5). `create` appends a new `active` row (1:N history); reading the
 * *current* subscription + quota decisions stay in `QuotaService` (single choke-point).
 */
@Injectable()
export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  async create(draft: SubscriptionDraft): Promise<SubscriptionRecord> {
    const tenantId = this.tenant.requireTenantId();
    const now = new Date();
    const [row] = await this.drizzle.db
      .insert(tenantSubscription)
      .values({
        id: randomUUID(),
        tenantId,
        plan: draft.plan,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        seatsLimit: draft.seatsLimit,
        storageQuota: draft.storageQuota ?? null,
        apiQuota: draft.apiQuota ?? null,
        periodEnd: draft.periodEnd ?? null,
        provider: draft.provider ?? null,
        providerCustomerId: draft.providerCustomerId ?? null,
        providerSubscriptionId: draft.providerSubscriptionId ?? null,
        // `updatedAt` is NOT NULL with no DB default (repo-wide convention: `$onUpdate` only
        // fires on UPDATE), so the insert path must stamp it — mirrors UserStatusService.
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row as SubscriptionRecord;
  }

  async history(): Promise<SubscriptionRecord[]> {
    const tenantId = this.tenant.requireTenantId();
    const rows = await this.drizzle.db
      .select()
      .from(tenantSubscription)
      .where(eq(tenantSubscription.tenantId, tenantId))
      .orderBy(desc(tenantSubscription.periodStart));
    return rows as SubscriptionRecord[];
  }
}
