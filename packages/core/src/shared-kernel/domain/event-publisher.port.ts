import type { DomainEvent } from './domain-event';

/**
 * 领域事件发布端口（ES 首切片 · module-users-es-append §2.3）。
 *
 * 收口 command handler 的派发点：实现侧封装「event store 启用则先耐久 append，
 * 再进程内 publishAll（EDA Phase A 语义无条件保留）」的双模顺序——append 失败
 * 则不进总线（宁缺勿错发）。handler 只依赖本端口，不再直注 EventBus，
 * 未来写路径切换（Phase B 后半）同样只动实现不动 handler。
 */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');

export interface DomainEventPublisher {
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}
