import 'reflect-metadata';
import { CAN_KEY, type CanRequirement } from '@core/saas-kit/authorization/can.decorator';
import { describe, expect, it } from 'vitest';
import { AuthorizationAdminController } from './authorization-admin.controller';
import {
  CreateRoleDto,
  GrantRolePermissionDto,
  RevokeRolePermissionDto,
} from './dto/authorization.dto';

/**
 * 角色/授权管理门面元数据锁（module-rbac-dynamic-roles S3·§2.5）。
 * 两类锁：① 每端点 `@Can(action, subject)` 与 seed 授予的管理职权格一致（Role: create/read/
 * update/delete·RoleGrant: create=read 列表/delete=revoke）——声明错格即授权面漂移；
 * ② DTO 的 `design:paramtypes` 保持值导入（S9：被 `import type` 擦除则校验整链静默跳过）。
 * 授权**裁决**（角色→allow/deny）由 CASL 守卫链锁测覆盖，本测只锁声明元数据。
 */

// `@Can` = `SetMetadata`：元数据挂在方法函数（descriptor.value）上，与 Reflector 读回同源。
const proto = AuthorizationAdminController.prototype as unknown as Record<string, unknown>;
const can = (method: string): CanRequirement | undefined =>
  Reflect.getMetadata(CAN_KEY, proto[method] as object) as CanRequirement | undefined;

describe('AuthorizationAdminController @Can 声明元数据', () => {
  it('角色管理端点声明落 Role 职权格', () => {
    expect(can('listRoles')).toEqual({ action: 'read', subject: 'Role' });
    expect(can('createRole')).toEqual({ action: 'create', subject: 'Role' });
    expect(can('renameRole')).toEqual({ action: 'update', subject: 'Role' });
    expect(can('deleteRole')).toEqual({ action: 'delete', subject: 'Role' });
  });

  it('授权管理端点声明落 RoleGrant 职权格（read=列表·create=授权·delete=撤权）', () => {
    expect(can('listGrants')).toEqual({ action: 'read', subject: 'RoleGrant' });
    expect(can('grant')).toEqual({ action: 'create', subject: 'RoleGrant' });
    expect(can('revoke')).toEqual({ action: 'delete', subject: 'RoleGrant' });
  });
});

describe('AuthorizationAdminController DTO design:paramtypes（S9 值导入防线）', () => {
  const paramTypes = (method: string) =>
    Reflect.getMetadata(
      'design:paramtypes',
      AuthorizationAdminController.prototype,
      method,
    ) as unknown[];

  it('createRole 携真实 CreateRoleDto（非 Object）', () => {
    expect(paramTypes('createRole')[0]).toBe(CreateRoleDto);
  });

  it('grant/revoke 携真实授权 DTO', () => {
    expect(paramTypes('grant')[0]).toBe(GrantRolePermissionDto);
    expect(paramTypes('revoke')[0]).toBe(RevokeRolePermissionDto);
  });
});
