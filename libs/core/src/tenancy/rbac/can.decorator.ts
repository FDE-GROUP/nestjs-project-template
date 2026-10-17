import { SetMetadata } from '@nestjs/common';
import type { TenantAction, TenantSubject } from './tenant-rules';

/** `@Can` 反射元数据键（`TenantPermissionGuard` 回读）。 */
export const CAN_KEY = 'tenancy:can';

/** 端点授权声明的可信形状：一对 (action, subject)。 */
export interface CanRequirement {
  readonly action: TenantAction;
  readonly subject: TenantSubject;
}

/**
 * 声明端点所需的租户级授权（module-rbac-casl 乙裁·CASL 惯用形）。
 * 由 `TenantPermissionGuard` 回读，携 ALS 预注入的角色交 `TENANT_PERMISSION_CHECKER`
 * 端口裁决（CASL·授权事实 SSOT = DB grant 行·module-rbac-dynamic-roles 丙裁）——声明是请求，裁决在引擎，无散点特判。
 *
 * subject 词表 = `TenantSubject` 词汇表（PascalCase·语言 SSOT）；新增资源先入词汇表，
 * 类型即随之可声明（编译期防旁逸）。
 *
 * @example `@Can('read', 'Workspace')`
 */
export const Can = (action: TenantAction, subject: TenantSubject) =>
  SetMetadata(CAN_KEY, { action, subject } satisfies CanRequirement);
