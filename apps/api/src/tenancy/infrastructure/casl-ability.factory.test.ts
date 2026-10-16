import {
  TENANT_RULES,
  type TenantAction,
  type TenantRole,
  type TenantSubject,
} from '@core/saas-kit/tenancy/rbac/tenant-rules';
import { describe, expect, it } from 'vitest';
import { buildTenantAbility } from './casl-ability.factory';

/**
 * 矩阵逐格等价锁测（module-rbac-casl §2.5 · DoD 首条）：
 * CASL ability 对 tenant-rules 表的每个 (role, subject, action) 格判定，
 * 必须与表声明严格一致——表内 can、表外 cannot（fail-closed）。
 * 这是旧 ac 语义 → 新 CASL 语义「迁移不丢权限」的验收锚。
 */

const ROLE_VALUES: TenantRole[] = ['owner', 'admin', 'member'];
const SUBJECT_VALUES: TenantSubject[] = ['Organization', 'Member', 'Invitation', 'Workspace'];
const ACTION_VALUES: TenantAction[] = ['create', 'read', 'update', 'delete', 'cancel'];

describe('buildTenantAbility ↔ TENANT_RULES 逐格等价', () => {
  it('每角色 × 每资源 × 每动作：表内 can、表外 cannot（全矩阵无旁逸）', () => {
    for (const role of ROLE_VALUES) {
      const ability = buildTenantAbility(role);
      for (const subject of SUBJECT_VALUES) {
        const allowed = TENANT_RULES[role][subject];
        expect(allowed, `role=${role} 缺资源词汇 ${subject}`).toBeInstanceOf(Array);
        for (const action of ACTION_VALUES) {
          const inTable = allowed.includes(action);
          expect(ability.can(action, subject), `表内判定 ${role} ${action} ${subject}`).toBe(
            inTable,
          );
          expect(ability.cannot(action, subject), `表外判定 ${role} ${action} ${subject}`).toBe(
            !inTable,
          );
        }
      }
    }
  });

  it('分层语义锚点（S4 BA 现状对拍后）：member 仅读（Workspace/Member/Invitation），写面全拒', () => {
    const ability = buildTenantAbility('member');
    // 可读三面：成员列表/待处理邀请对全体成员可见（BA list-members/list-invitations 仅 isMember）。
    expect(ability.can('read', 'Workspace')).toBe(true);
    expect(ability.can('read', 'Member')).toBe(true);
    expect(ability.can('read', 'Invitation')).toBe(true);
    // Organization 对 member 零格（矩阵表 member.Organization = []）。
    for (const action of ACTION_VALUES) {
      expect(ability.cannot(action, 'Organization'), `member 不应可 ${action} Organization`).toBe(
        true,
      );
    }
    // 写面（非 read）全拒：管理职权归 owner/admin。
    for (const subject of ['Member', 'Invitation', 'Workspace'] as TenantSubject[]) {
      for (const action of ACTION_VALUES) {
        if (action === 'read') continue;
        expect(ability.cannot(action, subject), `member 不应可 ${action} ${subject}`).toBe(true);
      }
    }
  });

  it('owner 与 admin 的唯一差异锚点：Organization delete 仅 owner', () => {
    expect(buildTenantAbility('owner').can('delete', 'Organization')).toBe(true);
    expect(buildTenantAbility('admin').can('delete', 'Organization')).toBe(false);
  });

  it('未知角色投影为空规则 → 全部拒绝（fail-closed 双保险）', () => {
    const ability = buildTenantAbility('superuser' as unknown as TenantRole);
    for (const subject of SUBJECT_VALUES) {
      for (const action of ACTION_VALUES) {
        expect(ability.cannot(action, subject), `未知角色不应可 ${action} ${subject}`).toBe(true);
      }
    }
  });

  it('规则词汇锁：表键集合 = 声明词汇表（防资源旁逸）', () => {
    for (const role of ROLE_VALUES) {
      expect(Object.keys(TENANT_RULES[role]).sort()).toEqual([...SUBJECT_VALUES].sort());
    }
  });
});
