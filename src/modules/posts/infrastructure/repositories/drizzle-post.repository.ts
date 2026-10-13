import { randomUUID } from 'node:crypto';
import { DrizzleService } from '@app/database/drizzle.service';
import { post } from '@app/database/schema';
import { TenantContextService } from '@app/tenancy/tenant-context.service';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type {
  PostDraft,
  PostRecord,
  PostRepository,
} from '../../domain/repositories/post.repository';

/**
 * Drizzle-backed post repository. This class is the ONE place isolation is enforced for
 * posts (global-tenancy §9.3 / FR-5, D2 compound boundary): every read filters by the
 * active tenant and, when the request selects a workspace (`x-workspace-id`), narrows to
 * that workspace too; every write stamps the trusted tenant (and the active workspace).
 * Ids resolve from the trusted AsyncLocalStorage context via `requireTenantId()`, which is
 * fail-closed (throws 403 when no tenant is bound).
 *
 * By construction the `organizationId` predicate always comes from the trusted context, so
 * a foreign `workspaceId` (or a forged one) can at most match 0 rows — cross-tenant leakage
 * is impossible. The port exposes no tenant/workspace argument, so removing any `where` /
 * stamp here makes the isolation regression test go red.
 */
@Injectable()
export class DrizzlePostRepository implements PostRepository {
  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  /** Trusted tenant (fail-closed) + optional active workspace selector, resolved once. */
  private scope(): { organizationId: string; workspaceId?: string } {
    return { organizationId: this.tenant.requireTenantId(), workspaceId: this.tenant.workspaceId };
  }

  async list(): Promise<PostRecord[]> {
    const { organizationId, workspaceId } = this.scope();
    const where = workspaceId
      ? and(eq(post.organizationId, organizationId), eq(post.workspaceId, workspaceId))
      : eq(post.organizationId, organizationId);
    return this.drizzle.db.query.post.findMany({
      where,
      orderBy: desc(post.createdAt),
    }) as Promise<PostRecord[]>;
  }

  async findById(id: string): Promise<PostRecord | null> {
    const { organizationId, workspaceId } = this.scope();
    const where = workspaceId
      ? and(
          eq(post.id, id),
          eq(post.organizationId, organizationId),
          eq(post.workspaceId, workspaceId),
        )
      : and(eq(post.id, id), eq(post.organizationId, organizationId));
    const row = await this.drizzle.db.query.post.findFirst({ where });
    return (row as PostRecord | undefined) ?? null;
  }

  async create(draft: PostDraft): Promise<PostRecord> {
    const { organizationId, workspaceId } = this.scope();
    const [row] = await this.drizzle.db
      .insert(post)
      .values({
        id: randomUUID(),
        title: draft.title,
        content: draft.content ?? null,
        published: draft.published ?? false,
        organizationId,
        workspaceId: workspaceId ?? null,
      })
      .returning();
    return row as PostRecord;
  }
}
