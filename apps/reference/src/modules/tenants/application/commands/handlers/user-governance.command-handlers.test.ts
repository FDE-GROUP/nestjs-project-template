import type { DrizzleService } from '@app/database/drizzle.service';
import { TENANT_STATUS } from '@core/tenancy/lifecycle/tenant-lifecycle';
import { USER_STATUS, type UserStatusService } from '@core/tenancy/lifecycle/user-status.service';
import type { PlatformAuditService } from '@core/tenancy/platform/platform-audit.service';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResumeUserCommand } from '../resume-user.command';
import { SuspendUserCommand } from '../suspend-user.command';
import { ResumeUserCommandHandler } from './resume-user.command-handler';
import { SuspendUserCommandHandler } from './suspend-user.command-handler';

function deps(result: unknown) {
  const transition = vi.fn().mockResolvedValue(result);
  const audit = { logUserGovernance: vi.fn() };
  // db.delete(...).where(...) → awaitable no-op
  const where = vi.fn(() => Promise.resolve());
  const del = vi.fn(() => ({ where }));
  const drizzle = { db: { delete: del } } as unknown as DrizzleService;
  return {
    transition,
    status: { transition } as unknown as UserStatusService,
    audit: audit as unknown as PlatformAuditService,
    auditSpy: audit.logUserGovernance,
    del,
    where,
    drizzle,
  };
}

describe('SuspendUserCommandHandler (S6 · FR-10 暂停 + session 硬删)', () => {
  it('transitions to suspended, deletes sessions, and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: TENANT_STATUS.ACTIVE,
      status: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.drizzle);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1', 'fraud'))).resolves.toEqual({
      userId: 'u1',
      status: USER_STATUS.SUSPENDED,
    });
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.SUSPENDED, { reason: 'fraud' });
    expect(d.del).toHaveBeenCalledTimes(1); // FR-10 immediate session invalidation
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'u1', 'op-1', {
      from: TENANT_STATUS.ACTIVE,
      to: USER_STATUS.SUSPENDED,
    });
  });

  it('returns null on not-found without deleting sessions or auditing', async () => {
    const d = deps({ kind: 'not-found' });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.drizzle);
    await expect(handler.execute(new SuspendUserCommand('ghost', 'op-1'))).resolves.toBeNull();
    expect(d.del).not.toHaveBeenCalled();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('409s + audits an illegal transition and does NOT delete sessions', async () => {
    const d = deps({
      kind: 'illegal',
      from: TENANT_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.drizzle);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.del).not.toHaveBeenCalled();
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
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.ACTIVE);
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
