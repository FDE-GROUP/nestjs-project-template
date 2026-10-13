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
 * Drizzle-backed post repository. This class is the ONE place tenant isolation is
 * enforced for posts (global-tenancy §9.3 / FR-5): every read filters by the active
 * tenant and every write stamps it, resolving the tenant from the trusted AsyncLocalStorage
 * context via `requireTenantId()`, which is fail-closed (throws 403 when none is bound).
 *
 * The port exposes no tenant argument, so correctness does not depend on callers — remove
 * any `where`/`organizationId` here and the isolation regression test goes red.
 */
@Injectable()
export class DrizzlePostRepository implements PostRepository {
  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  async list(): Promise<PostRecord[]> {
    const organizationId = this.tenant.requireTenantId();
    return this.drizzle.db.query.post.findMany({
      where: eq(post.organizationId, organizationId),
      orderBy: desc(post.createdAt),
    }) as Promise<PostRecord[]>;
  }

  async findById(id: string): Promise<PostRecord | null> {
    const organizationId = this.tenant.requireTenantId();
    const row = await this.drizzle.db.query.post.findFirst({
      where: and(eq(post.id, id), eq(post.organizationId, organizationId)),
    });
    return (row as PostRecord | undefined) ?? null;
  }

  async create(draft: PostDraft): Promise<PostRecord> {
    const organizationId = this.tenant.requireTenantId();
    const [row] = await this.drizzle.db
      .insert(post)
      .values({
        id: randomUUID(),
        title: draft.title,
        content: draft.content ?? null,
        published: draft.published ?? false,
        organizationId,
      })
      .returning();
    return row as PostRecord;
  }
}
