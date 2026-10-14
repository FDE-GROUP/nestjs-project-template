import { DOMAIN_EVENTS } from '@core/shared-kernel/domain/domain-event-names';
import { TenantStatusTransitionedEvent } from '@core/tenancy/lifecycle/events/tenant-status-transitioned.event';
import { describe, expect, it } from 'vitest';
import { User } from '../entities/user.aggregate';
import { UserRegisteredEvent } from './user-registered.event';

/**
 * 事件名契约双向锁（ES 首切片 · module-users-es-append §2.4）。
 * 机制级借鉴 research/nestjs-fastify-nx-review §2.2-②：事件名是跨上下文（及未来
 * relay/投影）的契约——集中常量 ⇄ 实际产出必须互相命中，新增旁逸事件名即红。
 */
describe('domain event name contract', () => {
  it('UserRegisteredEvent.EVENT_TYPE resolves to the central DOMAIN_EVENTS constant', () => {
    expect(UserRegisteredEvent.EVENT_TYPE).toBe(DOMAIN_EVENTS.userRegistered);
    // 线上传输值同时锁死（改名是契约变更，须过审计门）
    expect(UserRegisteredEvent.EVENT_TYPE).toBe('user.registered');
  });

  it('every event produced by the aggregate hits the DOMAIN_EVENTS value set', () => {
    const knownNames: string[] = Object.values(DOMAIN_EVENTS);
    const user = User.register({ id: 'u-1', email: 'ada@example.com', passwordHash: 'hash' });
    const events = [...user.domainEvents];
    expect(events).toHaveLength(1);
    for (const event of events) {
      expect(knownNames).toContain(event.eventType);
    }
  });

  it('TenantStatusTransitionedEvent（ES 第二切片）同样双向命中集中常量', () => {
    expect(TenantStatusTransitionedEvent.EVENT_TYPE).toBe(DOMAIN_EVENTS.tenantStatusTransitioned);
    // 线上传输值锁死：改名是契约变更，须过审计门
    expect(TenantStatusTransitionedEvent.EVENT_TYPE).toBe('tenant.status.transitioned');
    expect(TenantStatusTransitionedEvent.AGGREGATE_TYPE).toBe('tenant');
  });
});
