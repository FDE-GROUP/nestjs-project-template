import { DrizzleService } from '@app/database/drizzle.service';
import { organization } from '@app/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  isTenantBlocked,
  readTenantStatus,
  type TenantStatus,
  withTenantStatus,
} from './tenant-lifecycle';

/**
 * 租户状态读写唯一卡点（S4 · FR-1）：直接落 `organization.metadata`（jsonb），
 * 不另建表/列 → 无迁移。读侧 fail-closed：查无此行/非法 status 一律非 active。
 */
@Injectable()
export class TenantStatusService {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  /** 读取租户当前生命周期状态；行不存在/无合法状态 → undefined。 */
  async read(organizationId: string): Promise<TenantStatus | undefined> {
    const rows = await this.drizzle.db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return readTenantStatus(rows[0]?.metadata);
  }

  /** 是否生效（FR-1/NFR-1 fail-closed：仅显式 active 为真）。 */
  async isActive(organizationId: string): Promise<boolean> {
    return (await this.read(organizationId)) === 'active';
  }

  /**
   * 是否被拦（S4 中间件失能卡点·deny-list）：查无此行视同不拦（fail-open
   * 仅限“无租户行”边界，与 fail-closed 隔离不矛盾——无行则下游租户解析早已 fail）。
   */
  async isBlocked(organizationId: string): Promise<boolean> {
    const rows = await this.drizzle.db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    return isTenantBlocked(rows[0]?.metadata);
  }

  /**
   * 迁移状态（合并写回 metadata·保留其余键）并返回新状态；行不存在 → null。
   * 平台级动作专用（approve/reject），调用方负责平台权限裁决（PlatformOperatorGuard）。
   */
  async transition(organizationId: string, status: TenantStatus): Promise<TenantStatus | null> {
    const rows = await this.drizzle.db
      .select({ metadata: organization.metadata })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!rows.length) return null;
    const metadata = withTenantStatus(rows[0]?.metadata, status);
    await this.drizzle.db
      .update(organization)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(organization.id, organizationId));
    return status;
  }
}
