# 技术方案 · users 上下文 ES 首切片（event store 影子追加）

> 状态: **候选稿 · 待审计** | 读者: **Agent**（开发依据——**过审计门后方可实现**）
> blast radius: **module**（users 上下文 + shared-kernel 端口 + 新增 additive 表）
> 关联: [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase B（本切片为其**首切片细化**）· research/nestjs-fastify-nx-review §2.2（事件名常量 + 契约锁机制）· 记忆「ES 与 EDA 经人澄清升格为确定的架构目标」

## 1. 背景 · 目标 · 非目标

**背景**：ES/EDA 已升格为确定架构目标（人澄清 2026-10-14），roadmap 仍为方向性文件、粒度不足以直接开工。本切片把 Phase B 的第一步细化到可审可执行。

**目标（Shadow Append，影子追加）**：点亮 `event` 表——users 上下文的领域事件在**现有 CRUD 写路径保持不变**（CRUD 仍为唯一真相源）的前提下，**同请求内耐久追加**一份 ES 形状的事件行，作为未来回放/审计/投影的原料。这是 roadmap「写路径切换」的**安全前半步**：不动读侧、不回放、不改状态语义。

**非目标（本切片明确不做）**：
- ❌ 回放 / `rehydrate` 切换真相源 / 投影 / 快照（roadmap Phase B 后半与 Phase C）
- ❌ outbox 表与跨进程 relay / broker（单进程无跨边界需求；机制②③先行，见 §2.4）
- ❌ upcaster（`eventVersion` 列已预留）
- ❌ 其余上下文（tenancy/subscriptions 等）接入——判据满足后另开切片

## 2. 设计（决策完备 · 审计时逐条裁）

### 2.1 `event` 表（Drizzle 迁移 0009 · 纯 additive · 高危#1）

按 roadmap Phase B SQL 原样落表（列名/约束逐一对齐）：`id bigserial PK`、`aggregate_id text`、`aggregate_type text`、`version int`（聚合内序列）、`event_type text`、`event_version int`、`payload jsonb`、`metadata jsonb?`、`occurred_at timestamptz`、`created_at timestamptz default now()`、**UNIQUE (aggregate_type, aggregate_id, version)**。表名取 **`event`**（与 roadmap 一致·若人裁改 `event_store` 以裁为准）。流程硬约束：`generate` → **人审 SQL** → `migrate`（dev）→ `drizzle:studio` 核对三方一致；禁 push。

### 2.2 端口倒置（core 零驱动·沿 S10 P1b 先例）

- `packages/core/src/shared-kernel/`新增 `event-store.port.ts`：`EVENT_STORE` Symbol + `EventStore` 接口（`append(events: readonly DomainEvent[]): Promise<void>`——纯类型，不引 Drizzle/Nest）。
- `apps/reference/src/database/`（或 infrastructure 适配位）新增 `DrizzleEventStore` 适配器：信封列 → `event` 表行（`correlationId/causationId` 等入 `metadata jsonb`）；唯一键冲突**如实抛错**（fail-loud，不静默吞）。
- 注册：`@Global` provider，`enabled` 由配置驱动（见 §2.5）；core 生产文件保持零 `@app/*`（fallow guard 锁）。

### 2.3 `DomainEventPublisher` 收口派发点（唯一被改的接缝）

- 新增应用级能力 `DOMAIN_EVENT_PUBLISHER`（参考 application 层定义端口·infrastructure 实现）：`publishAll(events)` = **① event store 启用则先 append → ② EventBus.publishAll（进程内派发无条件保留·EDA Phase A 语义不变）**。
- `CreateUserCommandHandler` 从直注 `EventBus` 改注 `DOMAIN_EVENT_PUBLISHER`——**users 一个 handler 是本切片唯一业务改动点**；`pullDomainEvents()` 时点、HTTP 契约、响应体逐字节不变。
- 顺序刻意 append-先于-publish：影子写失败则事件不进进程内总线（宁缺勿错发·审计流一致性优先）。

### 2.4 事件名集中常量 + 契约双向锁（借 research §2.2 机制②③·为未来 relay 预保真）

- core 新增 `domain-event-names.ts`：`DOMAIN_EVENTS = { userRegistered: 'user.registered' } as const`；聚合改用常量而非字面量。
- 契约测试锁双向：聚合产出的 `eventType` **必须**命中 `DOMAIN_EVENTS` 值集（枚举全量·防旁逸）；信封字段断言沿用既有 `user-registered.event.test.ts`。
- envelope 已含 `eventVersion`（列已建）；「relay 拒收更新信封」机制待 relay 存在时启用，本切片仅保证**数据形态可被拒收规则消费**。

### 2.5 配置开关（双模·默认关）

- `EVENT_STORE_ENABLED`（boolean·默认 `false`）入 `envs/` 契约 + Joi schema（沿现有 runtime 校验）；`false` 时 `DomainEventPublisher` 纯透传 EventBus（等价现状·生产零行为变化），`true`（dev/test）启用 append。
- 迁移未 apply 的环境误开 = append 抛错 fail-loud——故开关默认关 + 文档写明「先 0009 apply 后开」。

## 3. 测试口径（Vitest）

① `DrizzleEventStore` 适配单测：列映射/唯一键冲突抛错/空批 noop；② `DomainEventPublisher` 单测：enabled 先 append 后 publish、disabled 纯透传、append 失败不发总线；③ handler 单测改注入点（既有断言 `publishAll`→改断言 publisher）；④ 事件名契约测（§2.4）；⑤ env-gated 真库往返：开开关→注册→查 `event` 表行存在且列逐字节符合信封（无 `E2E_DATABASE_URL` 默认 skip·沿 S9 分层）；⑥ `bun run ci` 全绿 + fallow 边界 0（禁加豁免）。

## 4. 影响面与风险 · 高危命中

- 命中**高危#1**（迁移 0009·逐次人审 apply）；不触 #2（零删除）/#4（零守卫与豁免面变化）。
- 新表行含用户注册 payload（email 等 PII）→ **数据驻留红线**：`event` 表数据同主库受 CL-DR 约束，无需额外处理，但**删除语义**须在 PIPL 切片时一并裁决（用户硬删是否级联删事件行·登记 §6 未决④）。
- 写路径多一次 INSERT（注册频率低·非热点·性能风险可忽略）；影子追加与 CRUD **非同事务**（极端下可能域行在/事件行缺——本切片接受此弱一致并如实记录，升级为同事务属 Phase B 后半）。

## 5. 完成判据（DoD）

- [ ] 0009 经人审 apply，三方一致（schema⇄迁移链⇄dev 库·`event` 表 9 列 + 唯一键 + 索引）
- [ ] enabled=true 下注册流事件耐久落表（真库往返测试绿）；enabled=false 行为与 HEAD 基线逐字节等价
- [ ] `DOMAIN_EVENTS` 常量 + 契约测上线；`packages/core` 零 `@app/*` 保持；CI 全绿、fallow 边界 0
- [ ] roadmap 回灌：Phase B 标注「首切片已落地（shadow append）」；plans README 状态同步
- [ ] 提交（Conventional Commits·显式 add）+ push（pre-push 跑 CI）

## 6. 审计记录

- 输入方案: 本文（含 §6 未决项归人）| 审计人: **（待审计）** | 日期: ____ | 结论: **（待审计）**
- 未决项（归人裁决·实现前清空）：① 首上下文 = users（**我的建议**：钩子/信封/契约测全就绪，影子追加不改 CRUD 语义、与 roadmap「identity 长期 CRUD」不冲突）vs tenants 生命周期（治理审计需求更刚性）② 开关命名 `EVENT_STORE_ENABLED` 是否入全环境 envs 契约 ③ 表名 `event` vs `event_store` ④ `event` 表 PII 保留与 PIPL 硬删的级联语义（缓裁·属后续切片但须留痕）
- 审计改动: 待审 | 关联风险: 高危#1（迁移）· 弱一致窗口（§4）· 无契约/守卫变更

## 7. 演变记录

- 2026-10-14 v0.1: 初稿——Phase B 首切片（shadow append）细化，含表/端口/发布收口/事件名锁/双模开关/六项测试口径（待审计）。
