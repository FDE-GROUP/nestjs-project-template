import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { TENANT_STATUS, type TenantStatus } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import type { PlatformAuditService } from '@core/saas-kit/tenancy/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { TenantGovernanceRepository } from '../../../domain/repositories/tenant-governance.repository';
import { DeleteTenantPermanentlyCommand } from '../delete-tenant-permanently.command';
import { DeleteTenantPermanentlyCommandHandler } from './delete-tenant-permanently.command-handler';

/** 调用序记录（坐实「先补删事件、后删主行」的顺序契约）。 */
const calls: string[] = [];
const state = {
  row: undefined as { organizationId: string; status: TenantStatus } | undefined,
  destroyed: true,
};

const findById: Mock = vi.fn();
const destroy: Mock = vi.fn();
const deleteByAggregate: Mock = vi.fn();
const logTenantGovernance: Mock = vi.fn();

const governance = { findById, destroy } as unknown as TenantGovernanceRepository;
const eventStore = { deleteByAggregate } as unknown as EventStore;
const audit = { logTenantGovernance } as unknown as PlatformAuditService;

const handler = new DeleteTenantPermanentlyCommandHandler(governance, eventStore, audit);

describe('DeleteTenantPermanentlyCommandHandler (NFR-6 删除半)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    // 基础实现每次重建（clearAllMocks 不复位 implementation，跨用例覆盖会污染后续）
    findById.mockImplementation(async (id: string) => {
      calls.push('findById');
      return state.row ? { organizationId: id, status: state.row.status } : undefined;
    });
    deleteByAggregate.mockImplementation(async () => {
      calls.push('purgeEvents');
      return 3;
    });
    destroy.mockImplementation(async () => {
      calls.push('destroy');
      return state.destroyed;
    });
    state.row = { organizationId: 'orgA', status: TENANT_STATUS.DELETED };
    state.destroyed = true;
  });

  it('deleted 终态：先补删事件后删主行，返回 purgedEvents 并落成功审计', async () => {
    const result = await handler.execute(new DeleteTenantPermanentlyCommand('orgA', 'op1'));
    expect(calls).toEqual(['findById', 'purgeEvents', 'destroy']); // 顺序契约（§3.1）
    expect(result).toEqual({ organizationId: 'orgA', purgedEvents: 3 });
    expect(deleteByAggregate).toHaveBeenCalledWith('tenant', 'orgA');
    expect(logTenantGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'orgA',
      'op1',
      expect.objectContaining({ from: TENANT_STATUS.DELETED }),
    );
  });

  it('非 deleted 终态（active）→ 409 前置闸，绝不触事件/主删', async () => {
    state.row = { organizationId: 'orgA', status: TENANT_STATUS.ACTIVE };
    await expect(
      handler.execute(new DeleteTenantPermanentlyCommand('orgA', 'op1')),
    ).rejects.toThrow(ConflictException);
    expect(calls).toEqual(['findById']);
    expect(logTenantGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'orgA',
      'op1',
      expect.objectContaining({ error: 'not_deleted_terminal' }),
    );
  });

  it('租户不存在 → null（404 幂等），无任何删除动作', async () => {
    state.row = undefined;
    await expect(
      handler.execute(new DeleteTenantPermanentlyCommand('ghost', 'op1')),
    ).resolves.toBeNull();
    expect(calls).toEqual(['findById']);
  });

  it('事件补删失败 fail-loud：主行不删，org 仍在可整请求重试', async () => {
    deleteByAggregate.mockImplementation(async () => {
      calls.push('purgeEvents');
      throw new Error('db down');
    });
    await expect(
      handler.execute(new DeleteTenantPermanentlyCommand('orgA', 'op1')),
    ).rejects.toThrow('db down');
    expect(calls).toEqual(['findById', 'purgeEvents']); // destroy 未被触达
  });

  it('并发窗口：状态检查后主行已被删（destroy false）→ null + already_gone 审计', async () => {
    state.destroyed = false;
    await expect(
      handler.execute(new DeleteTenantPermanentlyCommand('orgA', 'op1')),
    ).resolves.toBeNull();
    expect(logTenantGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'orgA',
      'op1',
      expect.objectContaining({ error: 'already_gone' }),
    );
  });
});
