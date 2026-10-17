import { SYSTEM_ROLE_KEYS, type TenantRole } from '@core/saas-kit/tenancy/rbac/tenant-rules';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * 租户成员/邀请管理门面的入参 DTO（module-rbac-casl §2.3.1·甲裁严格拆）。
 * 形状对齐 BA 内置端点 body（memberId/invitationId/organizationId/email/role），
 * 校验口径与既有 DTO 一致（class-validator·i18n message 键）。
 *
 * module-rbac-dynamic-roles 过渡注记：role 域暂维内置三 key（自定义角色尚无消费面，行为
 * 不变）；S3 改「SYSTEM_ROLE_KEYS ∪ 本租户自定义角色存在性」——存在性需查 DB，
 * class-validator 同步装饰式不可行，收开放宽为非空串 + service 层严格在库（fail-closed）。
 */

export class UpdateMemberRoleDto {
  @ApiProperty({ description: 'Member id to update', example: 'member-1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.memberId.required' })
  readonly memberId: string;

  @ApiProperty({ description: 'New tenant role', enum: SYSTEM_ROLE_KEYS })
  @IsIn(SYSTEM_ROLE_KEYS)
  readonly role: TenantRole;
}

export class RemoveMemberDto {
  @ApiProperty({ description: 'Member id to remove', example: 'member-1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.memberId.required' })
  readonly memberId: string;
}

export class LeaveTenantDto {
  @ApiProperty({ description: 'Organization id to leave', example: 'org_1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.organizationId.required' })
  readonly organizationId: string;
}

export class CreateInvitationDto {
  @ApiProperty({ description: 'Invitee email', example: 'new@acme.com' })
  @IsString()
  @IsNotEmpty({ message: 'validate.email.required' })
  readonly email: string;

  @ApiProperty({ description: 'Role granted on accept', enum: SYSTEM_ROLE_KEYS })
  @IsIn(SYSTEM_ROLE_KEYS)
  readonly role: TenantRole;
}

export class InvitationIdDto {
  @ApiProperty({ description: 'Invitation id', example: 'inv-1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.invitationId.required' })
  readonly invitationId: string;
}

export class SetActiveTenantDto {
  @ApiProperty({ description: 'Organization id to activate in session', example: 'org_1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.organizationId.required' })
  readonly organizationId: string;
}
