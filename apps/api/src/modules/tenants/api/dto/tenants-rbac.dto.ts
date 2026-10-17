import {
  TENANT_ACTION_VALUES,
  TENANT_SUBJECT_VALUES,
  type TenantAction,
  type TenantSubject,
} from '@core/saas-kit/tenancy/rbac/tenant-rules';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * 角色/授权管理门面入参 DTO（module-rbac-dynamic-roles §2.5·S3）。
 *
 * 词汇值域由 core 语言 SSOT 运行时数组单源给出（`TENANT_SUBJECT_VALUES`/`TENANT_ACTION_VALUES`）——
 * `@IsIn` 只挡「词汇外」形状；**授权事实的存在性/条件形状**不在此判：conditions 形状交 domain 策略闸
 * （`isValidGrantConditions`·白名单外拒），角色存在性交仓储/服务查库（fail-closed）。DTO 不复权限裁决
 * （那是 `@Can` + CASL 守卫职责）。
 */

/** 角色 key 形态校验（词法/保留 key 的严格判定在 domain 策略闸，此处仅挡空/非串）。 */
const roleKeyProp = {
  description: 'Tenant-scoped role key (system key or custom key)',
  example: 'editor',
};

export class CreateRoleDto {
  @ApiProperty(roleKeyProp)
  @IsString()
  @IsNotEmpty({ message: 'validate.roleKey.required' })
  readonly key: string;

  @ApiProperty({ description: 'Human-readable role name', example: 'Editor' })
  @IsString()
  @IsNotEmpty({ message: 'validate.roleName.required' })
  readonly name: string;
}

export class RenameRoleDto {
  @ApiProperty(roleKeyProp)
  @IsString()
  @IsNotEmpty({ message: 'validate.roleKey.required' })
  readonly key: string;

  @ApiProperty({ description: 'New human-readable role name', example: 'Editors' })
  @IsString()
  @IsNotEmpty({ message: 'validate.roleName.required' })
  readonly name: string;
}

export class DeleteRoleDto {
  @ApiProperty(roleKeyProp)
  @IsString()
  @IsNotEmpty({ message: 'validate.roleKey.required' })
  readonly key: string;
}

export class GrantRolePermissionDto {
  @ApiProperty(roleKeyProp)
  @IsString()
  @IsNotEmpty({ message: 'validate.roleKey.required' })
  readonly roleKey: string;

  @ApiProperty({ description: 'Subject resource', enum: TENANT_SUBJECT_VALUES })
  @IsIn(TENANT_SUBJECT_VALUES)
  readonly subject: TenantSubject;

  @ApiProperty({ description: 'Action', enum: TENANT_ACTION_VALUES })
  @IsIn(TENANT_ACTION_VALUES)
  readonly action: TenantAction;

  @ApiPropertyOptional({
    description:
      'Instance-level conditions (whitelist-checked server-side; omit = whole-subject grant)',
    example: { ownerId: '{{userId}}' },
  })
  @IsOptional()
  @IsObject({ message: 'validate.grantConditions.object' })
  readonly conditions?: Record<string, unknown>;
}

export class RevokeRolePermissionDto extends GrantRolePermissionDto {
  // 撤权：conditions 省略/null = 撤整 subject 级行；传对象 = 按 JSON 等值精确撤单条件行（甲裁表形配套语义）。
}
