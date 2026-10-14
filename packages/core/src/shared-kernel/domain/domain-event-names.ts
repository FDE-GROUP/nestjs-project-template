/**
 * 领域事件名集中常量（ES 首切片 · module-users-es-append §2.4）。
 *
 * 机制级借鉴 research/nestjs-fastify-nx-review §2.2-②：事件名是跨上下文（及未来
 * relay/投影）的**契约**，必须集中声明而非散落字面量；契约测试双向锁定
 * 「聚合实际产出的 eventType ∈ 本常量值集」，防旁逸。新增事件名一律先加这里。
 */
export const DOMAIN_EVENTS = {
  userRegistered: 'user.registered',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
