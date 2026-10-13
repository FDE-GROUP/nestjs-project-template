import { BaseCommand } from '@app/shared-kernel/cqrs/types';

/**
 * 平台级动作（FR-11①·FR-6）：经营者驳回 pending 申请 → 硬删组织行（FK 级联清成员/邀请）。
 * 命中返回 true；目标不存在 → false（控制层转 404）。仅用于未生效 pending（生效租删除属 S5 治理）。
 */
export class RejectTenantCommand extends BaseCommand<boolean> {
  constructor(readonly organizationId: string) {
    super();
  }
}
