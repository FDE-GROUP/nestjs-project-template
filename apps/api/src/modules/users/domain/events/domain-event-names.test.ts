import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { UserStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/user-status-transitioned.event';
import { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';
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

  it('UserStatusTransitionedEvent（ES 第三切片）命中常量且与 user.registered 同聚合流', () => {
    expect(UserStatusTransitionedEvent.EVENT_TYPE).toBe(DOMAIN_EVENTS.userStatusTransitioned);
    // 线上传输值锁死：改名是契约变更，须过审计门
    expect(UserStatusTransitionedEvent.EVENT_TYPE).toBe('user.status.transitioned');
    // 同流不变量：与 UserRegisteredEvent 同一 aggregateType（PIPL deleteByAggregate 覆盖两事件）
    expect(UserStatusTransitionedEvent.AGGREGATE_TYPE).toBe(UserRegisteredEvent.AGGREGATE_TYPE);
  });

  it('TenantRejectedEvent（ES 第四切片）命中常量且与 tenant.transitioned 同聚合流', () => {
    expect(TenantRejectedEvent.EVENT_TYPE).toBe(DOMAIN_EVENTS.tenantRejected);
    // 线上传输值锁死：改名是契约变更，须过审计门
    expect(TenantRejectedEvent.EVENT_TYPE).toBe('tenant.rejected');
    // 同流不变量：与租户状态迁移同一 aggregateType（version 同 tenant 流连续）
    expect(TenantRejectedEvent.AGGREGATE_TYPE).toBe(TenantStatusTransitionedEvent.AGGREGATE_TYPE);
  });
});
