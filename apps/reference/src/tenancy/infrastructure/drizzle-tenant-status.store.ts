import { DrizzleService } from '@app/database/drizzle.service';
import { organization } from '@app/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { TenantStatusStore } from '../lifecycle/tenant-status.store';

/**
 * `TenantStatusStore` 的 Drizzle 适配（参考应用侧·§9.5.4①B）：直接落 Better Auth 的
 * `organization.metadata`（jsonb），不另建表/列 → 无迁移。core 经端口消费、不感知此实现。
 */
@Injectable()
export class DrizzleTenantStatusStore implements TenantStatusStore {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async load(organizationId: string): Promise<{ metadata: unknown } | undefined> {
    const rows = await this.drizzle.db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return rows.length ? { metadata: rows[0]?.metadata } : undefined;
  }

  async save(organizationId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.drizzle.db
      .update(organization)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(organization.id, organizationId));
  }
}
