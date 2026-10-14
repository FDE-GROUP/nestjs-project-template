import { DrizzleService } from '@app/database/drizzle.service';
import {
  invitation,
  member,
  organization,
  post,
  tenantSubscription,
  user,
  workspace,
} from '@app/database/schema';
import {
  readTenantStatus,
  TENANT_STATUS,
  type TenantStatus,
} from '@core/tenancy/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import { type Column, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type {
  ExportedTenantMember,
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDataExport,
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

  async exportTenantData(organizationId: string): Promise<TenantDataExport | null> {
    // 租户全列（含 metadata 状态机）；**不按 status 过滤**——deleted 终态可导是 S5
    // 软删「保留行供按租户导出/硬删」的取证用途（NFR-6）。
    const [tenant] = await this.drizzle.db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        metadata: organization.metadata,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!tenant) return null;

    // 成员名册：user 侧仅取最小身份面（id/name/email/handle）——凭据列（password 等）
    // 在 select 投影面就排除，而非取回后再删（domain port SECURITY 注释同口径）。
    const memberRows = await this.drizzle.db
      .select({
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userHandle: user.handle,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organizationId));
    const members: ExportedTenantMember[] = memberRows.map((r) => ({
      id: r.id,
      role: r.role,
      createdAt: r.createdAt,
      user: { id: r.userId, name: r.userName, email: r.userEmail, handle: r.userHandle },
    }));

    const [invitations, workspaces, subscriptions, posts] = await Promise.all([
      this.drizzle.db
        .select()
        .from(invitation)
        .where(eq(invitation.organizationId, organizationId)),
      this.drizzle.db
        .select({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        })
        .from(workspace)
        .where(eq(workspace.organizationId, organizationId)),
      this.drizzle.db
        .select({
          id: tenantSubscription.id,
          plan: tenantSubscription.plan,
          status: tenantSubscription.status,
          seatsLimit: tenantSubscription.seatsLimit,
          storageQuota: tenantSubscription.storageQuota,
          apiQuota: tenantSubscription.apiQuota,
          periodStart: tenantSubscription.periodStart,
          periodEnd: tenantSubscription.periodEnd,
          provider: tenantSubscription.provider,
          providerCustomerId: tenantSubscription.providerCustomerId,
          providerSubscriptionId: tenantSubscription.providerSubscriptionId,
          createdAt: tenantSubscription.createdAt,
          updatedAt: tenantSubscription.updatedAt,
        })
        .from(tenantSubscription)
        .where(eq(tenantSubscription.tenantId, organizationId)),
      this.drizzle.db
        .select({
          id: post.id,
          title: post.title,
          content: post.content,
          published: post.published,
          workspaceId: post.workspaceId,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        })
        .from(post)
        .where(eq(post.organizationId, organizationId)),
    ]);

    return { tenant, members, invitations, workspaces, subscriptions, posts };
  }

  async destroy(organizationId: string): Promise<boolean> {
    // 仅删主行；member/invitation/workspace/tenant_subscription/post 由 FK
    // onDelete: 'cascade' 在 DB 层自动消灭（单一卡点·零迁移）。
    const rows = await this.drizzle.db
      .delete(organization)
      .where(eq(organization.id, organizationId))
      .returning({ id: organization.id });
    return rows.length > 0;
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
