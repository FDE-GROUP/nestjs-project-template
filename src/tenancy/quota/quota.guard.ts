import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import type { TenantContextService } from '../tenant-context.service';
import { QUOTA_KEY, type QuotaRequirement } from './quota.decorator';
import type { QuotaService } from './quota.service';

/**
 * 逐路由配额守卫（S7 · FR-7）。仅对声明了 `@Quota({ seats })` 的写路径生效：
 * 从 ALS 取活跃租户（缺失 fail-closed → 403），对照生效订阅限额裁决，超限由
 * `QuotaService.assertSeats` 抛 402。未标注 `@Quota` 直接放行（opt-in）。
 *
 * 与 `TenantPermissionGuard` 一致：经 `@UseGuards` 逐路由挂载，**不升级为全局
 * APP_GUARD**（blast radius=每路由·高危#4 挂账）。生产挂点（BA member-add 路由）
 * 为接线点留后续切片，本片以单测/守卫测坐实超限拒绝。
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContextService,
    private readonly quota: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<QuotaRequirement | undefined>(QUOTA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // 未声明配额需求 → 非本守卫关注点，放行。
    if (!requirement) return true;

    const tenantId = this.tenantContext.tenantId;
    if (!tenantId) throw new ForbiddenException('No active tenant context');

    await this.quota.assertSeats(tenantId, requirement.seats ?? 1);
    return true;
  }
}
