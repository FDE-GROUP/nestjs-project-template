import { DrizzleService } from '@app/database/drizzle.service';
import { invitation, member, organization, post, workspace } from '@app/database/schema';
import {
  readTenantStatus,
  TENANT_STATUS,
  type TenantStatus,
} from '@app/tenancy/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import { type Column, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type {
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDiagnostics,
  TenantGovernanceRepository,
} from '../../domain/repositories/tenant-governance.repository';

/** 无状态记录（存量/seeded）视同 active——与 canTransition 缺省/middleware deny-list 同口径。 */
function effectiveStatus(metadata: unknown): TenantStatus {
  return readTenantStatus(metadata) ?? TENANT_STATUS.ACTIVE;
}

/**
 * Drizzle adapter for platform governance (S5 · FR-6).
 *
 * 跨租户视图：刻意**不注入任何租户上下文**（requireTenantId 于此无关，平台级天然全量，
 * FR-11①）——访问裁决完全由 controller 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 */
@Injectable()
export class DrizzleTenantGovernanceRepository implements TenantGovernanceRepository {
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async list(opts: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<PlatformTenantPage> {
    const where = opts.search
      ? or(
          ilike(organization.name, `%${opts.search}%`),
          ilike(organization.slug, `%${opts.search}%`),
        )
      : undefined;

    const rows = await this.drizzle.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        metadata: organization.metadata,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(where)
      .orderBy(desc(organization.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const [{ count }] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(organization)
      .where(where);

    const items: PlatformTenantRow[] = rows.map((r) => ({
      organizationId: r.id,
      name: r.name,
      slug: r.slug,
      status: effectiveStatus(r.metadata),
      createdAt: r.createdAt,
    }));
    return { items, total: count, limit: opts.limit, offset: opts.offset };
  }

  async findById(organizationId: string): Promise<PlatformTenantRow | null> {
    const rows = await this.drizzle.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        metadata: organization.metadata,
        createdAt: organization.createdAt,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      organizationId: r.id,
      name: r.name,
      slug: r.slug,
      status: effectiveStatus(r.metadata),
      createdAt: r.createdAt,
    };
  }

  async diagnostics(organizationId: string): Promise<TenantDiagnostics | null> {
    const tenant = await this.findById(organizationId);
    if (!tenant) return null;
    const [members, invitations, workspaces, posts] = await Promise.all([
      this.countWhere(member, member.organizationId, organizationId),
      this.countWhere(invitation, invitation.organizationId, organizationId),
      this.countWhere(workspace, workspace.organizationId, organizationId),
      this.countWhere(post, post.organizationId, organizationId),
    ]);
    return {
      tenant,
      memberCount: members,
      invitationCount: invitations,
      workspaceCount: workspaces,
      postCount: posts,
    };
  }

  private async countWhere(
    table: typeof member | typeof invitation | typeof workspace | typeof post,
    column: Column,
    organizationId: string,
  ): Promise<number> {
    const rows = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(table)
      .where(eq(column, organizationId));
    return rows[0]?.count ?? 0;
  }
}
