# 事件溯源与事件驱动架构路线图（ES + EDA Roadmap）

> 受众: **人 + Agent**（**确定采纳目标**·分期递延；`读者: Agent`）| 语言: 中文优先（`AGENTS.md` §6）

事件溯源（ES）与事件驱动架构（EDA）是**已确定的架构目标**（人澄清 2026-10-14：当前架构 CA + DDD + CQRS，**明确还需增加 ES 与 EDA**），按分期**审慎递进**：分期节奏与门禁不变，但不再以「某上下文真需要才做」为前提。本文记录：(a) 当前 CA/DDD/CQRS 构建中**已接好的钩子**、(b) 点亮它们所需的**具体 schema 与写路径切换**、(c) Sagas 如何**叠加其上**。

指导原则：**现在只做让未来 ES/EDA 变便宜的最小工作，但方向已定、按分期推进**。ES 是存储范式（事后 retrofit 很贵），不同于 CA/DDD/CQRS 这类代码组织方式（随时可重构）——所以**接缝预先切好**；EDA 的演进路径：Phase A 进程内事件（已落地）→ Phase B 同事务 outbox（耐久发布）→ 跨进程 broker 订阅（微服务触发后，见 [microservice-readiness](./microservice-readiness.md) §2.2）。

## Phase A — 今天已接好的钩子（本仓库现状）

1. **写路径只有 Command → CommandHandler**。Controller 从不直接改状态。把某个 handler 的持久化从 CRUD 换成 append-event，只触及 handler + repository，不触及传输层。
2. **聚合根记录领域事件**：经 `AggregateRoot.recordEvent(...)` 记录、`pullDomainEvents()` 暴露。仓储返回同一个聚合实例，使待派发事件活到 dispatch 点。见 `packages/core/src/shared-kernel/domain/aggregate-root.ts` 与 `apps/reference/src/modules/users/domain/entities/user.aggregate.ts`。
3. **`DomainEvent` 信封已是 ES 形状**——`eventId`、`aggregateId`、`aggregateType`、`eventType`、`eventVersion`、`occurredAt`、`correlationId`、`causationId`、`payload`。这些正是一张 append-only 存储表的全部列；`eventVersion` 就是未来 upcaster 的键。契约测试锁住这些字段（`apps/reference/src/modules/users/domain/events/user-registered.event.test.ts`）。
4. 事件当前**仅进程内派发**：`EventBus.publishAll(...)` + `@EventsHandler`（`apps/reference/src/modules/users/infrastructure/dispatchers/`）。**什么都不持久化**——没有 event store、投影、快照或 outbox。

## Phase B — 为选定上下文点亮 ES

> **首切片已落地（shadow append·2026-10-14·[module-users-es-append](./module-users-es-append.md)）**：users 域事件经双模开关耐久落 `event` 表（迁移 0009·camelCase 列名 + `eventId` 保真列·见其 §6），CRUD 仍为唯一真相源；下述 schema 即其形态，回放/投影/同事务化待续。
>
> **第二切片已落地（2026-10-14·[module-tenancy-es-lifecycle-events](./module-tenancy-es-lifecycle-events.md)）**：租户治理动作（approve/suspend/resume/delete）经 `TenantStatusService.transition` 单点产出 `tenant.status.transitioned` 同表耐久（无新迁移）；`EventStore.deleteByAggregate` 收口 PIPL 硬删级联补删（§6-④ 定向关闭）。
>
> **第三切片已落地（2026-10-14·[module-tenancy-es-user-status-events](./module-tenancy-es-user-status-events.md)）**：平台用户 suspend/resume 经 `UserStatusService.transition` 产出 `user.status.transitioned`，与 `user.registered` **同聚合流**（version 跨事件类型连续·PIPL 补删零额外代码覆盖）。至此 event store 覆盖：注册流 + 租户/用户两级治理动作。

只针对**需要审计轨迹的重状态上下文**（如 orders / ledger）。auth users 这类有状态身份数据**可能永远保持 CRUD**。

### Event store 表（Drizzle）

```sql
CREATE TABLE event (
  id            bigserial PRIMARY KEY,        -- 全局序列（全局排序）
  aggregate_id  text        NOT NULL,          -- 流 id
  aggregate_type text       NOT NULL,          -- 如 'user'
  version       int         NOT NULL,          -- 聚合内序列，乐观锁
  event_type    text        NOT NULL,          -- 'user.registered'
  event_version int         NOT NULL,          -- 用于 upcasting 的 schema 版本
  payload       jsonb       NOT NULL,
  metadata      jsonb,                         -- correlationId/causationId/actor/...
  occurred_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, version)
);
CREATE INDEX event_aggregate_idx ON event (aggregate_type, aggregate_id);
```

经 `drizzle-kit generate` + `drizzle-kit migrate` 落表（显式迁移，**永不** `synchronize`）；本表属高危#1，逐次人审后 apply。

### 写路径切换

- 今天：`handler → repo.save(aggregate)`（INSERT/UPDATE），然后 `eventBus.publishAll(events)`。
- ES：`handler → eventStore.append(aggregateId, events, expectedVersion)`——聚合的 `toState()`/`rehydrate()` 通过回放事件重建当前状态。
- 被 append 的就是 `pullDomainEvents()` 的输出（metadata → `jsonb`）。Command handler 主体其余不变。
- 若事件必须与 append **同事务跨进程边界**，引入 **outbox**（避免 dual-write）。设计参考（机制级借鉴·非工具链，见 [research/nestjs-fastify-nx-review.md](../research/nestjs-fastify-nx-review.md) §2.2 / [plans/microservice-readiness.md](./microservice-readiness.md) §2.3-2）：① 域行与事件行**同事务原子写**；② 事件名集中常量 + 契约测试双向锁定（与 trigger SQL/仓储同锁）；③ envelope 携 schema 版本，relay **拒收**比自己新的信封而非猜；④ 消费者幂等为硬要求（重投必然发生）；⑤ 发布通道做成**双模开关**（进程内默认 / outbox 耐久），与 Phase A 平滑共存。

### 读侧

- 从事件流构建**投影（projections）**写入读表；现有 `Query` handler 继续读这些表——其契约不变。
- 当某条流的重放成本开始要紧时加**快照（snapshots）**（存 `aggregate_type='snapshot'` 或独立表；从最近快照回放）。

## Phase C — Sagas（流程编排）

`@nestjs/cqrs` 自带 Sagas：一个响应事件、发出命令的 `@Saga()` 生成器，支撑跨上下文的**补偿事务**（如 register → create profile → 失败则删除 auth user）。在需要多步编排之处替代 Phase A 中临时的 `@EventsHandler` 反应。无 DB 变更；Saga 放在 `application/`。

## 当前明确不做（分期节奏，非方向保留）

无 event store、无投影、无快照、无 outbox、无 upcaster、无 dual-write 顾虑。这些属于 Phase B/C，**以真实的回放/审计需求为门**。

## 参考警示

那些号称「Event Sourcing」、实际只用进程内事件总线的 boilerplate（如 `@nestjs/event-emitter` + sagas、无 store/回放）**是事件驱动，不是 ES**。本路线图保持这个区分的诚实性：Phase A 是事件驱动；ES 从 Phase B 才开始。

## 演变记录

| 日期 | 变更 |
|------|------|
| 2026-10-14 | 整篇中文化（AGENTS §6 中文优先）；Phase A 引用路径校准至 S10 后布局（`packages/core/src/shared-kernel/*`、`apps/reference/src/modules/users/*`）；补 outbox 设计参考链接（前次已回灌）；补高危#1 口径一句 |
| 2026-10-14 | 经人澄清升格定位：ES + EDA 为**确定的架构目标**（CA+DDD+CQRS+ES+EDA 五件套），分期节奏与门禁不变；标题/指导原则改写，补 EDA 演进路径（进程内→outbox→broker） |
