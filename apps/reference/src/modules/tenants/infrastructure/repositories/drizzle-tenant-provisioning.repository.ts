import { DrizzleService } from '@app/database/drizzle.service';
import { organization } from '@app/database/schema';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  readTenantStatus,
  TENANT_STATUS,
  type TenantStatus,
} from '@core/tenancy/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type {
  TenantProvisioningReceipt,
  TenantProvisioningRepository,
} from '../../domain/repositories/tenant-provisioning.repository';

/**
 * Provisioning gateway adapter（S4·FR-1 唯一建租户通道）。
 *
 * `submit` 经服务端系统动作调 Better Auth `createOrganization`：无 session + `body.userId`
 * → `isSystemAction`，源码坐实不受 HTTP 层 `allowUserToCreateOrganization:false` 封禁；强制
 * 盖 `metadata.status = pending_approval`（客户端无法自助即时开通），申请人经 BA 原生成首名
 * owner member（FR-12）。`remove` 直接删组织行（FK 级联清成员/邀请）。
 */
@Injectable()
export class DrizzleTenantProvisioningRepository implements TenantProvisioningRepository {
  constructor(
    @Inject(DrizzleService) private readonly drizzle: DrizzleService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
  ) {}

  async submit(userId: string, name: string, slug: string): Promise<TenantProvisioningReceipt> {
    const auth = this.authInstance.get();
    if (!auth) throw new Error('Auth instance not initialized');
    const created = await auth.api.createOrganization({
      body: {
        name,
        slug,
        userId,
        metadata: { status: TENANT_STATUS.PENDING, appliedAt: new Date().toISOString() },
      },
    });
    const status: TenantStatus = readTenantStatus(created?.metadata) ?? TENANT_STATUS.PENDING;
    return { organizationId: String(created?.id), status };
  }

  async remove(organizationId: string): Promise<boolean> {
    const rows = await this.drizzle.db
      .delete(organization)
      .where(eq(organization.id, organizationId))
      .returning({ id: organization.id });
    return rows.length > 0;
  }
}
