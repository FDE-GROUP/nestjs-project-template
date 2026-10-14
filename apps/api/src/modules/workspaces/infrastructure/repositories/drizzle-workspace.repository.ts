import { randomUUID } from 'node:crypto';
import { DrizzleService } from '@app/database/drizzle.service';
import { workspace } from '@app/database/schema';
import type {
  WorkspaceDraft,
  WorkspaceRecord,
  WorkspaceRepository,
} from '@core/saas-kit/modules/workspaces/domain/repositories/workspace.repository';
import { createPage, type Page, type PageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

/**
 * Drizzle-backed workspace repository — the ONE place workspace isolation is enforced
 * (global-tenancy §9.3 / FR-5). The owning tenant is resolved from the trusted
 * AsyncLocalStorage context via `requireTenantId()` (fail-closed → 403 when none is bound);
 * every read filters by `organizationId` and every write stamps it, so a foreign workspace
 * id (in update/delete) matches 0 rows and cross-tenant leakage is structurally impossible.
 *
 * The port exposes no tenant argument, so removing any `where`/stamp here makes the
 * isolation regression test go red.
 */
@Injectable()
export class DrizzleWorkspaceRepository implements WorkspaceRepository {
  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  async list(request: PageRequest): Promise<Page<WorkspaceRecord>> {
    const organizationId = this.tenant.requireTenantId();
    const where = eq(workspace.organizationId, organizationId);
    const rows = (await this.drizzle.db.query.workspace.findMany({
      where,
      orderBy: asc(workspace.createdAt),
      limit: request.limit,
      offset: request.offset,
    })) as WorkspaceRecord[];
    const [{ count }] = await this.drizzle.db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspace)
      .where(where);
    return createPage(rows, count, request);
  }

  async create(draft: WorkspaceDraft): Promise<WorkspaceRecord> {
    const organizationId = this.tenant.requireTenantId();
    const [row] = await this.drizzle.db
      .insert(workspace)
      .values({
        id: randomUUID(),
        name: draft.name,
        slug: draft.slug,
        organizationId,
      })
      .returning();
    return row as WorkspaceRecord;
  }

  async update(id: string, draft: Partial<WorkspaceDraft>): Promise<WorkspaceRecord | null> {
    const organizationId = this.tenant.requireTenantId();
    const set: Record<string, unknown> = {};
    if (draft.name !== undefined) set.name = draft.name;
    if (draft.slug !== undefined) set.slug = draft.slug;
    if (Object.keys(set).length === 0) {
      // Nothing to change: still resolve within-tenant so a foreign id cannot be probed.
      const current = await this.drizzle.db.query.workspace.findFirst({
        where: and(eq(workspace.id, id), eq(workspace.organizationId, organizationId)),
      });
      return (current as WorkspaceRecord | undefined) ?? null;
    }
    const rows = await this.drizzle.db
      .update(workspace)
      .set(set)
      .where(and(eq(workspace.id, id), eq(workspace.organizationId, organizationId)))
      .returning();
    return (rows[0] as WorkspaceRecord | undefined) ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const organizationId = this.tenant.requireTenantId();
    const rows = await this.drizzle.db
      .delete(workspace)
      .where(and(eq(workspace.id, id), eq(workspace.organizationId, organizationId)))
      .returning({ id: workspace.id });
    return rows.length > 0;
  }
}
