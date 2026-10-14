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
 */
export const EVENT_STORE = Symbol('EVENT_STORE');

export interface EventStore {
  append(events: readonly DomainEvent[]): Promise<void>;
}
