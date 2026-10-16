import { TENANT_ROLE_VALUES, type TenantRole } from '@core/saas-kit/tenancy/rbac/tenant-rules';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

/**
 * 租户成员/邀请管理门面的入参 DTO（module-rbac-casl §2.3.1·甲裁严格拆）。
 * 形状对齐 BA 内置端点 body（memberId/invitationId/organizationId/email/role），
 * 校验口径与既有 DTO 一致（class-validator·i18n message 键）。
 */

export class UpdateMemberRoleDto {
  @ApiProperty({ description: 'Member id to update', example: 'member-1' })
  @IsString()
  @IsNotEmpty({ message: 'validate.memberId.required' })
  readonly memberId: string;

  @ApiProperty({ description: 'New tenant role', enum: TENANT_ROLE_VALUES })
  @IsIn(TENANT_ROLE_VALUES)
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

  @ApiProperty({ description: 'Role granted on accept', enum: TENANT_ROLE_VALUES })
  @IsIn(TENANT_ROLE_VALUES)
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
