import { DrizzleService } from '@app/database/drizzle.service';
import { user, userStatus } from '@app/database/schema';
import { createPage } from '@core/shared-kernel/domain/pagination';
import { TENANT_STATUS, type TenantStatus } from '@core/tenancy/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import type {
  PlatformUserPage,
  PlatformUserRow,
  UserGovernanceRepository,
} from '../../domain/repositories/user-governance.repository';

/**
 * Drizzle adapter for platform user governance (S6 · FR-6/FR-10).
 *
 * 跨平台用户列表：`user` LEFT JOIN `user_status`——无状态记录行（未被动过暂停）视同 active，
 * 与租户 deny-list 同口径。刻意**不注入任何租户上下文**（平台级天然全量，FR-11①）——访问
 * 裁决完全由 controller 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 */
@Injectable()
export class DrizzleUserGovernanceRepository implements UserGovernanceRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async list(opts: { limit: number; offset: number; search?: string }): Promise<PlatformUserPage> {
    const where = opts.search
      ? or(ilike(user.name, `%${opts.search}%`), ilike(user.email, `%${opts.search}%`))
      : undefined;

    const rows = await this.drizzle.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        status: userStatus.status,
        createdAt: user.createdAt,
      })
      .from(user)
      .leftJoin(userStatus, eq(user.id, userStatus.userId))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const [{ count }] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(where);

    const items: PlatformUserRow[] = rows.map((r) => ({
      userId: r.id,
      name: r.name,
      email: r.email,
      status: (r.status ?? TENANT_STATUS.ACTIVE) as TenantStatus,
      createdAt: r.createdAt,
    }));
    return createPage(items, count, opts);
  }
}
