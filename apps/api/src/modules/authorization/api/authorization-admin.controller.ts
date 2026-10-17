import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantRbacAdminService } from '../application/tenant-rbac-admin.service';
import type {
  TenantRoleGrantView,
  TenantRoleView,
} from '../domain/repositories/tenant-rbac.repository';
import {
  CreateRoleDto,
  DeleteRoleDto,
  GrantRolePermissionDto,
  RenameRoleDto,
  RevokeRolePermissionDto,
} from './dto/authorization.dto';

/**
 * 角色/授权**管理门面**（module-rbac-dynamic-roles §2.5·S3·甲裁自建角色 + 丁裁随片授权面）。
 *
 * 授权在我·数据在 DB：每端点声明 `@Can(<动作>, 'Role'|'RoleGrant')`，由 `TenantPermissionGuard`
 * 携 ALS 角色经 CASL（规则源 = 本租户 DB grant 行）裁决；通过后委派 `TenantRbacAdminService`
 * 落库（写侧过 domain 策略闸 + 同通道审计行 + 写后失效投影缓存）。BA 内置 create-role/roles 端点
 * 维持封堵（甲裁不代建→本片自建），本门面是租户差异化授权策略的唯一入口。
 *
 * `@Can` 落点与 seed 一致：owner/admin 持 `Role`(create/read/update/delete) + `RoleGrant`
 * (create/read/delete)，member 无 → 非管理员请求由守卫 403（fail-closed）。
 */
@ApiTags('tenants')
@Controller('tenants/roles')
@UseGuards(TenantScopeGuard, TenantPermissionGuard)
export class AuthorizationAdminController {
  constructor(@Inject(TenantRbacAdminService) private readonly rbac: TenantRbacAdminService) {}

  @Get()
  @Can('read', 'Role')
  @ApiOperation({ summary: 'List roles of the active tenant (system + custom)' })
  @ApiResponse({ status: 200, description: 'Role views.' })
  @ApiResponse({ status: 403, description: 'CASL deny (no Role read).' })
  listRoles(): Promise<TenantRoleView[]> {
    return this.rbac.listRoles();
  }

  @Post()
  @Can('create', 'Role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a custom role (owner/admin)' })
  @ApiResponse({ status: 200, description: 'Created role view.' })
  @ApiResponse({ status: 400, description: 'Invalid/reserved role key.' })
  @ApiResponse({ status: 409, description: 'Role key already exists.' })
  createRole(@Body() dto: CreateRoleDto): Promise<TenantRoleView> {
    return this.rbac.createRole(dto.key, dto.name);
  }

  @Post('rename')
  @Can('update', 'Role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a custom role (system roles protected)' })
  @ApiResponse({ status: 200, description: 'Renamed.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  @ApiResponse({ status: 409, description: 'System role protected.' })
  async renameRole(@Body() dto: RenameRoleDto): Promise<void> {
    await this.rbac.renameRole(dto.key, dto.name);
  }

  @Post('delete')
  @Can('delete', 'Role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a custom role (grants cascade; system roles protected)' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  @ApiResponse({ status: 409, description: 'System role protected.' })
  async deleteRole(@Body() dto: DeleteRoleDto): Promise<void> {
    await this.rbac.deleteRole(dto.key);
  }

  @Get('grants')
  @Can('read', 'RoleGrant')
  @ApiOperation({ summary: 'List grant rows of a role (echo checked state)' })
  @ApiResponse({ status: 200, description: 'Grant views (subject/action/conditions).' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  listGrants(@Query('roleKey') roleKey?: string): Promise<TenantRoleGrantView[]> {
    if (!roleKey) {
      throw new BadRequestException('roleKey query param is required');
    }
    return this.rbac.getGrants(roleKey);
  }

  @Post('grants')
  @Can('create', 'RoleGrant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant a permission cell to a role (multi-condition rows = OR union)' })
  @ApiResponse({ status: 200, description: 'Granted.' })
  @ApiResponse({ status: 400, description: 'Invalid conditions (whitelist-only).' })
  @ApiResponse({ status: 404, description: 'Role not found.' })
  @ApiResponse({ status: 409, description: 'Duplicate grant.' })
  async grant(@Body() dto: GrantRolePermissionDto): Promise<void> {
    await this.rbac.grant(dto.roleKey, {
      subject: dto.subject,
      action: dto.action,
      conditions: dto.conditions ?? null,
    });
  }

  @Post('grants/revoke')
  @Can('delete', 'RoleGrant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a grant (conditions null = whole-subject row; object = exact row)',
  })
  @ApiResponse({ status: 200, description: 'Revoked.' })
  @ApiResponse({ status: 404, description: 'Role or matching grant not found.' })
  async revoke(@Body() dto: RevokeRolePermissionDto): Promise<void> {
    await this.rbac.revoke(dto.roleKey, dto.subject, dto.action, dto.conditions ?? null);
  }
}
