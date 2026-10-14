import type { DomainEvent } from './domain-event';

/**
 * Event store 端口（ES 首切片 · module-users-es-append §2.2，沿 S10 P1 端口倒置先例）。
 *
 * core 侧只声明契约（纯类型，零 Drizzle/Nest 依赖）；持久化原语由参考应用的
 * Drizzle 适配实现并注入。首切片为 **shadow append**：CRUD 仍是唯一真相源，
 * append 只是把事件耐久落表供未来回放/审计，不提供读取/重放语义。
 *
 * 约定：`append` 对空批 noop；唯一键（aggregateType, aggregateId, version）冲突
 * **如实抛错**（fail-loud，不静默吞、不重试覆盖）。
 *
 * `deleteByAggregate` 为 PIPL 级联补删面（module-tenancy-es-lifecycle-events §3.2）：
 * 用户硬删后其事件行不会被任何 FK 机制清除（event 表无 FK），由应用层显式调用；
 * **不受** EVENT_STORE_ENABLED 开关控制——表在就要清，开关只管写入。
 */
export const EVENT_STORE = Symbol('EVENT_STORE');

export interface EventStore {
  append(events: readonly DomainEvent[]): Promise<void>;
  deleteByAggregate(aggregateType: string, aggregateId: string): Promise<number>;
}
