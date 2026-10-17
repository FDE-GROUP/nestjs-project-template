import type { TenantStatus } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { UserStatus } from '@core/saas-kit/modules/tenants/lifecycle/user-status.service';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ApiProperty } from '@nestjs/swagger';
import type { TenantHardDeleteResult } from '../../../tenants/application/commands/delete-tenant-permanently.command';
import type { UserGovernanceResult } from '../../../tenants/application/read-models/platform-user.read-model';
import type {
  PlatformTenantRow,
  TenantDiagnostics,
} from '../../../tenants/domain/repositories/tenant-governance.repository';
import type { PlatformUserRow } from '../../../tenants/domain/repositories/user-governance.repository';

/**
 * 平台治理面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = 各 controller 实际返回类型（platform-tenants / platform-users）；
 * 漂移防线：文末编译期双向赋值锁（tsc 结构恒等·build 拓红），非 runtime 测。
 * 状态枚举复用 @core TENANT_STATUS 单源（UserStatus ≡ TenantStatus 别名）。
 */
const STATUS_VALUES = Object.values(TENANT_STATUS);

export class PlatformTenantRowResponse {
  @ApiProperty({ description: 'organization 主键（= 租户 id）。' })
  organizationId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ enum: STATUS_VALUES, description: '生命周期状态（无记录视同 active）。' })
  status!: TenantStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _ptrf: PlatformTenantRowResponse = {} as PlatformTenantRow;
const _ptrb: PlatformTenantRow = {} as PlatformTenantRowResponse;
void _ptrf;
void _ptrb;

/** offset 分页整体响应（`PlatformTenantPage = Page<PlatformTenantRow>`·整个分页对象裹入 data）。 */
export class PlatformTenantPageResponse {
  @ApiProperty({ isArray: true, type: () => PlatformTenantRowResponse })
  items!: PlatformTenantRowResponse[];

  @ApiProperty({ description: '全量行数。' })
  total!: number;

  @ApiProperty({ description: '回显页宽。' })
  limit!: number;

  @ApiProperty({ description: '回显偏移。' })
  offset!: number;
}

const _ptpf: PlatformTenantPageResponse = {} as Page<PlatformTenantRow>;
const _ptpb: Page<PlatformTenantRow> = {} as PlatformTenantPageResponse;
void _ptpf;
void _ptpb;

export class TenantDiagnosticsResponse {
  @ApiProperty({ type: () => PlatformTenantRowResponse, description: '租户行。' })
  tenant!: PlatformTenantRowResponse;

  @ApiProperty({ description: '成员数。' })
  memberCount!: number;

  @ApiProperty({ description: '待处理邀请数。' })
  invitationCount!: number;

  @ApiProperty({ description: '工作区数。' })
  workspaceCount!: number;

  @ApiProperty({ description: '帖子数。' })
  postCount!: number;
}

const _tdf: TenantDiagnosticsResponse = {} as TenantDiagnostics;
const _tdb: TenantDiagnostics = {} as TenantDiagnosticsResponse;
void _tdf;
void _tdb;

export class TenantHardDeleteResultResponse {
  @ApiProperty({ description: '被硬删的 organization 主键。' })
  organizationId!: string;

  @ApiProperty({ description: '本次清除的 lifecycle 事件数（供审计核对）。' })
  purgedEvents!: number;
}

const _thdf: TenantHardDeleteResultResponse = {} as TenantHardDeleteResult;
const _thdb: TenantHardDeleteResult = {} as TenantHardDeleteResultResponse;
void _thdf;
void _thdb;

export class PlatformUserRowResponse {
  @ApiProperty({ description: '用户主键。' })
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: STATUS_VALUES, description: '治理状态（无记录视同 active）。' })
  status!: UserStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

const _purf: PlatformUserRowResponse = {} as PlatformUserRow;
const _purb: PlatformUserRow = {} as PlatformUserRowResponse;
void _purf;
void _purb;

/** offset 分页整体响应（`PlatformUserPage = Page<PlatformUserRow>`）。 */
export class PlatformUserPageResponse {
  @ApiProperty({ isArray: true, type: () => PlatformUserRowResponse })
  items!: PlatformUserRowResponse[];

  @ApiProperty({ description: '全量行数。' })
  total!: number;

  @ApiProperty({ description: '回显页宽。' })
  limit!: number;

  @ApiProperty({ description: '回显偏移。' })
  offset!: number;
}

const _pupf: PlatformUserPageResponse = {} as Page<PlatformUserRow>;
const _pupb: Page<PlatformUserRow> = {} as PlatformUserPageResponse;
void _pupf;
void _pupb;

export class UserGovernanceResultResponse {
  @ApiProperty({ description: '用户主键。' })
  userId!: string;

  @ApiProperty({ enum: STATUS_VALUES, description: '迁移后的新状态。' })
  status!: UserStatus;
}

const _ugrf: UserGovernanceResultResponse = {} as UserGovernanceResult;
const _ugrb: UserGovernanceResult = {} as UserGovernanceResultResponse;
void _ugrf;
void _ugrb;
