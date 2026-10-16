import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TENANT_STATUS } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import {
  USER_STATUS,
  type UserStatusService,
} from '@core/saas-kit/tenancy/lifecycle/user-status.service';
import type { PlatformAuditService } from '@core/saas-kit/tenancy/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResumeUserCommand } from '../resume-user.command';
import { SuspendUserCommand } from '../suspend-user.command';
import { ResumeUserCommandHandler } from './resume-user.command-handler';
import { SuspendUserCommandHandler } from './suspend-user.command-handler';

function deps(result: unknown) {
  const transition = vi.fn().mockResolvedValue(result);
  const audit = { logUserGovernance: vi.fn() };
  // mikro.fork() → em.nativeDelete(...) → awaitable（FR-10 session 硬删改走 MikroORM）
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const fork = vi.fn(async () => ({ nativeDelete }));
  const mikro = { fork } as unknown as MikroOrmService;
  return {
    transition,
    status: { transition } as unknown as UserStatusService,
    audit: audit as unknown as PlatformAuditService,
    auditSpy: audit.logUserGovernance,
    nativeDelete,
    fork,
    mikro,
  };
}

describe('SuspendUserCommandHandler (S6 · FR-10 暂停 + session 硬删)', () => {
  it('transitions to suspended, deletes sessions, and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: TENANT_STATUS.ACTIVE,
      status: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.mikro);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1', 'fraud'))).resolves.toEqual({
      userId: 'u1',
      status: USER_STATUS.SUSPENDED,
    });
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.SUSPENDED, {
      reason: 'fraud',
      actorId: 'op-1',
    });
    expect(d.nativeDelete).toHaveBeenCalledTimes(1); // FR-10 immediate session invalidation
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'u1', 'op-1', {
      from: TENANT_STATUS.ACTIVE,
      to: USER_STATUS.SUSPENDED,
    });
  });

  it('returns null on not-found without deleting sessions or auditing', async () => {
    const d = deps({ kind: 'not-found' });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.mikro);
    await expect(handler.execute(new SuspendUserCommand('ghost', 'op-1'))).resolves.toBeNull();
    expect(d.nativeDelete).not.toHaveBeenCalled();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('409s + audits an illegal transition and does NOT delete sessions', async () => {
    const d = deps({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.mikro);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.nativeDelete).not.toHaveBeenCalled();
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'u1', 'op-1', {
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
      error: 'illegal_transition',
    });
  });
});

describe('ResumeUserCommandHandler (S6 · FR-10 恢复·不重建 session)', () => {
  it('transitions suspended → active and audits (no session delete side-effect)', async () => {
    const d = deps({
      kind: 'ok',
      previous: TENANT_STATUS.SUSPENDED,
      status: USER_STATUS.ACTIVE,
    });
    const handler = new ResumeUserCommandHandler(d.status, d.audit);
    await expect(handler.execute(new ResumeUserCommand('u1', 'op-1'))).resolves.toEqual({
      userId: 'u1',
      status: USER_STATUS.ACTIVE,
    });
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.ACTIVE, { actorId: 'op-1' });
    expect(d.auditSpy).toHaveBeenCalledWith('resume', 'u1', 'op-1', {
      from: TENANT_STATUS.SUSPENDED,
      to: USER_STATUS.ACTIVE,
    });
  });

  it('409s + audits an illegal resume (active user is a no-op edge? deleted is terminal)', async () => {
    const d = deps({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.ACTIVE,
    });
    const handler = new ResumeUserCommandHandler(d.status, d.audit);
    await expect(handler.execute(new ResumeUserCommand('u1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.auditSpy).toHaveBeenCalledWith('resume', 'u1', 'op-1', {
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.ACTIVE,
      error: 'illegal_transition',
    });
  });
});
